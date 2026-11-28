/**
 * 薄いコンテンツの記事をContentEnricherで更新するスクリプト
 *
 * 使用方法:
 * npx tsx scripts/maintenance/enrich-thin-content.ts [options]
 *
 * オプション:
 * --dry-run        実際の更新を行わずにシミュレーション
 * --source=xxx     特定のソースのみ処理
 * --limit=n        処理する記事数を制限
 * --skip=n         最初のn件をスキップ（継続処理用。前回の実行が出した next_skip を渡す）
 * --skip-summary   要約のリセットをスキップ（要約のある記事は本文だけ入れ替える。要約の無い記事は
 *                  本文が取れれば、本文が原因の skipReason を外して要約の対象に戻す）
 * --speakerdeck    Speaker Deck の記事（はてなブックマーク経由で集めたものを含む）だけ処理
 *
 * 知らない引数や、数として読めない --limit / --skip を渡すと、何もせずに失敗で終わる
 * （打ち間違えたまま全件を書き換えないため）。
 *
 * 本番では GitHub Actions の Maintenance - Run Script で流す。画面に出るのは最後の `名前=数値` の行だけ。
 * ジョブは60分で打ち切られる（1件あたり3秒ほどかかる）ので、--limit で分けて流し、次の回は出力の
 * next_skip を --skip に渡す。next_skip は目安で、ほかの処理と重なると数件ずれるので、最後に --skip を
 * 付けずに --dry-run --limit で流して残りを確かめる。queued_for_summary は要約の対象に戻った件数で、要約は
 * manage-summaries.ts generate で作る
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import type { Prisma } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';
import { closeRedisConnection } from '@/lib/redis/client';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import { ContentEnricherFactory } from '../../lib/enrichers';
import { HATENA_BLOG_DEV_SOURCE_ID } from '../../lib/enrichers/hatena';
import { isEnrichmentSkipped } from '../../lib/fetchers/config/foreign-rss-sources';
import {
  contentStateWhere,
  isAcceptableEnrichedContent,
} from '../scheduled/utils/summary-reset';
import { SLIDE_URL_PREFIXES } from '../../lib/sources/slide-source';
import { isUrlFromDomain } from '../../lib/utils/url/url-validator';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = createPrismaClient();

interface Options {
  dryRun: boolean;
  source?: string;
  limit?: number;
  skip?: number;
  skipSummary: boolean;
  speakerDeck: boolean;
}

/** これより短い本文を薄いとみなす */
const THIN_CONTENT_LENGTH = 500;

/** 記事ごとの待ち時間（ミリ秒）。はてなブログは連続で取ると 429 を返すので、毎時の収集と同じ間隔を空ける */
const DEFAULT_SLEEP_MS = 1500;

function sleepMsFor(sourceId: string): number {
  return sourceId === HATENA_BLOG_DEV_SOURCE_ID
    ? Math.max(DEFAULT_SLEEP_MS, env.HATENA_BLOG_DEV_ENRICH_SLEEP_MS)
    : DEFAULT_SLEEP_MS;
}

const SPEAKER_DECK_SOURCE_NAME = 'Speaker Deck';
const SPEAKER_DECK_HOST = 'speakerdeck.com';
/** Speaker Deck の記事 URL の先頭（収集時の形。lib/sources/slide-source.ts のスライドの URL から選ぶ） */
const SPEAKER_DECK_URL_PREFIXES = SLIDE_URL_PREFIXES.filter(
  (prefix) => new URL(prefix).hostname.replace(/^www\./, '') === SPEAKER_DECK_HOST
);

/**
 * Speaker Deck の記事か。はてなブックマーク経由で集めた記事はソース名では分からないので URL でも見る。
 * URL の判定は SpeakerDeckEnricher が担当する記事（canHandle）と同じ
 */
function isSpeakerDeckArticle(article: { url: string; source: { name: string } }): boolean {
  return (
    article.source.name === SPEAKER_DECK_SOURCE_NAME ||
    isUrlFromDomain(article.url, SPEAKER_DECK_HOST)
  );
}

/**
 * 薄い本文の候補を DB で絞る条件。本文の長さは contentLength（DB のトリガーが CHAR_LENGTH(content) を保つ列）で見る。
 * 全件を読んで JavaScript で絞ると、ソースを指定しないときに全記事の本文を読み込むため
 */
export function thinContentWhere(options: {
  source?: string;
  speakerDeck?: boolean;
}): Prisma.ArticleWhereInput {
  return {
    AND: [
      { OR: [{ contentLength: null }, { contentLength: { lt: THIN_CONTENT_LENGTH } }] },
      ...(options.source ? [{ source: { name: options.source } }] : []),
      ...(options.speakerDeck
        ? [
            {
              OR: [
                { source: { name: SPEAKER_DECK_SOURCE_NAME } },
                ...SPEAKER_DECK_URL_PREFIXES.map((prefix) => ({ url: { startsWith: prefix } })),
              ],
            },
          ]
        : []),
    ],
  };
}

interface ThinContentCandidateArticle {
  url: string;
  content: string | null;
  thumbnail: string | null;
  source: { name: string };
}

/**
 * 薄いコンテンツ（本文が空、または500文字未満）の記事のうち、
 * エンリッチメント処理の対象とすべきものを判定する。
 *
 * - 本文が完全に空（null または空文字）の記事は、サムネイルの有無に関わらず対象に含める。
 *   GenericContentEnricherは本文抽出に失敗してもサムネイルのみ返すことがあり、
 *   collect-feeds.ts はサムネイルのみでも記事を保存する。従来ロジックは
 *   「サムネイルあり = 処理済み」とみなして除外していたため、
 *   「本文なし・サムネイルあり」の記事が恒久的に回復対象から漏れていた（Issue #629 項目5）。
 * - 本文はあるが500文字未満の記事は、既にサムネイルを取得済みであれば
 *   ContentEnricherによる処理済みとみなし、従来通り除外する。Speaker Deck の記事は除外しない。
 *   サムネイル（スライドの1枚目）は収集時に付くので、本文を取り直したかどうかの目印にならないため
 *   （はてなブックマーク経由で集めた Speaker Deck も同じ）
 */
export function isThinContentCandidate(article: ThinContentCandidateArticle): boolean {
  const content = article.content;

  if (!content) {
    // 本文が完全に空: サムネイル有無に関わらず対象
    return true;
  }

  if (content.length >= THIN_CONTENT_LENGTH) {
    return false;
  }

  // 本文はあるが薄い（1〜499文字）: サムネイル取得済みなら処理済みとみなす
  const hasEnrichedThumbnail = Boolean(article.thumbnail) && !isSpeakerDeckArticle(article);
  return !hasEnrichedThumbnail;
}

/** `--name=n` の n を読む。整数でないか min 未満なら失敗にする */
function parseIntOption(arg: string, name: string, min: number): number {
  const raw = arg.slice(`--${name}=`.length);
  const value = Number(raw);
  if (raw === '' || !Number.isInteger(value) || value < min) {
    throw new Error(`--${name} には${min}以上の整数を指定してください: ${arg}`);
  }
  return value;
}

export function parseArgs(args: string[]): Options {
  const options: Options = {
    dryRun: false,
    skipSummary: false,
    speakerDeck: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--source=')) {
      const source = arg.slice('--source='.length);
      if (!source) throw new Error('--source にソース名を指定してください');
      options.source = source;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseIntOption(arg, 'limit', 1);
    } else if (arg.startsWith('--skip=')) {
      options.skip = parseIntOption(arg, 'skip', 0);
    } else if (arg === '--skip-summary') {
      options.skipSummary = true;
    } else if (arg === '--speakerdeck') {
      options.speakerDeck = true;
    } else {
      throw new Error(`不明な引数です: ${arg}`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.error('========================================');
  console.error('薄いコンテンツのエンリッチメント');
  console.error('========================================');
  console.error('オプション:', {
    dryRun: options.dryRun ? 'Yes' : 'No',
    source: options.source || 'All',
    limit: options.limit || 'No limit',
    skip: options.skip || 0,
    skipSummary: options.skipSummary ? 'Yes' : 'No',
    speakerDeck: options.speakerDeck ? 'Yes' : 'No',
  });
  console.error('');

  if (options.dryRun) {
    console.error('⚠️  ドライランモード: 実際の更新は行いません');
    console.error('');
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let thumbnailCount = 0;
  let skipEnrichmentCount = 0;
  let concurrentUpdateSkipCount = 0;
  // 要約の対象に戻った（要約が無く、skipReason も無い）記事の数
  let queuedForSummaryCount = 0;
  // 更新して、次の実行の候補から外れた記事の数（next_skip の計算に使う）
  let resolvedCount = 0;

  try {
    // 本文が空か500文字未満の記事を取得
    const allThinArticles = await prisma.article.findMany({
      where: thinContentWhere(options),
      include: {
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    // 既に処理済みの記事は除外
    let thinArticles = allThinArticles.filter(isThinContentCandidate);

    // skipを適用
    if (options.skip && options.skip > 0) {
      console.error(`⏭️  最初の${options.skip}件をスキップします`);
      thinArticles = thinArticles.slice(options.skip);
    }

    // limitを適用
    if (options.limit) {
      thinArticles = thinArticles.slice(0, options.limit);
    }

    console.error(`📊 対象記事数: ${thinArticles.length}件`);

    const enricherFactory = new ContentEnricherFactory();

    for (let i = 0; i < thinArticles.length; i++) {
      const article = thinArticles[i];
      const progress = `[${i + 1}/${thinArticles.length}]`;

      console.error(`\n${progress} 処理中: ${article.title.substring(0, 50)}...`);
      console.error(`  ソース: ${article.source.name}`);
      console.error(`  現在のコンテンツ: ${article.content?.length || 0}文字`);
      console.error(`  URL: ${article.url}`);

      // skipEnrichment 対象ソース（enricher による本文上書きを行わない）は除外
      if (isEnrichmentSkipped(article.source.name)) {
        console.error(`  ⏭️  スキップ: ソース設定により本文上書き対象外`);
        skipEnrichmentCount++;
        continue;
      }

      // エンリッチャーを取得
      const enricher = enricherFactory.getEnricher(article.url, article.source.id);

      if (!enricher) {
        console.error(`  ⏭️  スキップ: 対応するEnricherがありません`);
        skipCount++;
        continue;
      }

      try {
        // コンテンツをエンリッチ
        console.error(`  🔄 エンリッチ中...`);
        const enrichedData = await enricher.enrich(article.url);

        if (!enrichedData) {
          console.error(`  ❌ エンリッチ失敗: コンテンツを取得できませんでした`);
          failCount++;
          continue;
        }

        const newContent =
          enrichedData.content && enrichedData.content.length > (article.content?.length || 0)
            ? enrichedData.content
            : null;
        const newThumbnail =
          enrichedData.thumbnail && !article.thumbnail ? enrichedData.thumbnail : null;

        if (!newContent && !newThumbnail) {
          console.error(`  ⏭️  スキップ: 新しいデータがありません`);
          skipCount++;
          continue;
        }

        console.error(`  ✅ エンリッチ成功:`);
        if (newContent) {
          console.error(`    - コンテンツ: ${article.content?.length || 0} → ${newContent.length}文字`);
        }
        if (newThumbnail) {
          console.error(`    - サムネイル: 取得成功`);
        }

        if (!options.dryRun) {
          // データベースを更新
          const updateData: Prisma.ArticleUpdateManyMutationInput = {};
          let resetsSummary = false;
          let clearsSkipReason = false;

          if (newContent) {
            updateData.content = newContent;
            // 本文を更新する他の全経路（collect-feeds.ts の5箇所、
            // re-enrich-publickey-nulls.ts）と同様に
            // contentUpdatedAt を進める。manage-quality-scores.ts は
            // contentUpdatedAt の差分で品質スコア再計算の対象を抽出するため
            // （scripts/scheduled/manage-quality-scores.ts:117-122）、更新しないと
            // 本文が変わったのに品質スコアが古いまま残る。
            updateData.contentUpdatedAt = new Date();
            // PDF / SLIDE は本文の有無と無関係な恒久スキップ理由のため、要約リセットも
            // 行わない。リセットすると要約が消えたまま、恒久スキップにより再生成もされず
            // 復旧しなくなる（collect-feeds.ts の自己修復パス・enrich-single-article.ts と
            // 同じ扱い）。
            const isSummaryEligible =
              article.skipReason !== 'PDF' && article.skipReason !== 'SLIDE';

            if (!options.skipSummary && isSummaryEligible) {
              // 要約をリセット（再生成が必要）
              updateData.summary = null;
              updateData.detailedSummary = null;
              // summaryVersionはnullableでないため、0に設定
              updateData.summaryVersion = 0;
              // 一覧は summaryComputedAt で要約済みかを見る。残すと要約の無いまま一覧に出る
              updateData.summaryComputedAt = null;
              resetsSummary = true;
              console.error(`    - 要約: リセット（再生成が必要）`);
            }
            // 本文回復時は本文起因の skipReason（THIN_CONTENT / CONTENT_FETCH_FAILED /
            // QUALITY_FAILED）と summaryError をクリアし、scripts:summarize
            // （skipReason: null 対象）で要約再生成されるようにする。
            // PDF / SLIDE は本文の有無と無関係の恒久理由のためクリアしない。
            // skipReason が null で summaryError だけ残るケース（一時的な要約失敗）
            // もクリア対象にするため truthy 判定はしない。
            // collect-feeds.ts の受入基準（isAcceptableEnrichedContent）と同じにし、
            // わずかな伸びでのクリアを防ぐ
            if (isSummaryEligible && isAcceptableEnrichedContent(newContent)) {
              updateData.skipReason = null;
              updateData.summaryError = null;
              clearsSkipReason = true;
            }
          }

          if (newThumbnail) {
            updateData.thumbnail = newThumbnail;
          }

          // CAS: 読み込んだときと本文の状態（contentLength と contentUpdatedAt）が同じときだけ更新する。
          // 毎時の収集など、ほかの処理がこの間に本文を書いていたら、古い読み込みを基準に上書きしない
          // （Issue #629 項目6）。updatedAt では比べない。品質スコアの再計算が raw SQL の NOW()（マイクロ秒）で
          // 書くので、ミリ秒の JavaScript の Date と一致せず、誰も更新していなくても負ける（同期した開発 DB の
          // 薄い記事で約7割）。ほかの保守スクリプトと同じ比べ方（contentStateWhere）にする。
          // サムネイルを書くときは、読み込んだときのまま空であることも条件にする（収集にはサムネイルだけを書く経路がある）
          const { count } = await prisma.article.updateMany({
            where: {
              id: article.id,
              ...contentStateWhere(article),
              ...(newThumbnail ? { thumbnail: article.thumbnail } : {}),
            },
            data: updateData,
          });

          if (count > 0) {
            console.error(`  💾 データベース更新完了`);
            successCount++;
            // 更新しなかったときはサムネイルも保存されないため、加算は更新できた後に行う
            if (newThumbnail) {
              thumbnailCount++;
            }
            const summaryIsEmpty = resetsSummary || !article.summary;
            const skipReasonIsNull = clearsSkipReason || article.skipReason === null;
            if (newContent && summaryIsEmpty && skipReasonIsNull) {
              queuedForSummaryCount++;
            }
            if (
              !isThinContentCandidate({
                ...article,
                content: newContent ?? article.content,
                thumbnail: newThumbnail ?? article.thumbnail,
              })
            ) {
              resolvedCount++;
            }
            // 本文（と要約）を書き換えたので、記事の表示のキャッシュを消す。書き込みは済んでいるので失敗は警告に留める
            try {
              await cacheInvalidator.onArticleUpdated(article.id);
            } catch (cacheError) {
              console.error('  ⚠️  記事のキャッシュの無効化に失敗しました（TTL で切れます）:', cacheError);
            }
          } else {
            console.error(`  ⏭️  スキップ: 読み込んだ後にほかの処理が本文かサムネイルを更新した（または記事が削除された）ため、今回の取得結果は反映しません`);
            concurrentUpdateSkipCount++;
          }
        } else {
          // ドライラン: DB は更新しないが、取得できた件数として計上する
          successCount++;
          if (newThumbnail) {
            thumbnailCount++;
          }
        }

      } catch (error) {
        console.error(`  ❌ エラー:`, error);
        failCount++;
      } finally {
        // レート制限対策。取れなかったときも空ける（空けずに次を取ると、はてなブログは続けて 429 を返す）
        await new Promise(resolve => setTimeout(resolve, sleepMsFor(article.source.id)));
      }
    }

    if (!options.dryRun && successCount > 0) {
      // onArticleUpdated は一覧のキャッシュを消さないので、最後に一覧のキャッシュも消す
      // （enrich-single-article.ts・collect-feeds の要約生成の後と同じ）
      try {
        await cacheInvalidator.onBulkImport();
      } catch (cacheError) {
        console.error('警告: 一覧のキャッシュの無効化に失敗しました（TTL で切れます）:', cacheError);
      }
    }

    // 結果サマリー
    console.error('\n========================================');
    console.error('処理結果サマリー');
    console.error('========================================');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`❌ 失敗: ${failCount}件`);
    console.error(`⏭️  スキップ: ${skipCount}件`);
    console.error(`⏭️  スキップ（対象外ソース）: ${skipEnrichmentCount}件`);
    console.error(`⏭️  スキップ（ほかの処理が先に更新）: ${concurrentUpdateSkipCount}件`);
    console.error(`🖼️  サムネイル取得: ${thumbnailCount}件`);
    console.error(`📊 合計: ${thinArticles.length}件`);

    if (options.dryRun) {
      console.error('\n⚠️  ドライランモードのため、実際の更新は行われませんでした。');
      console.error('本番実行するには --dry-run オプションを外してください。');
    } else if (queuedForSummaryCount > 0) {
      console.error(`\n📝 要約の対象に戻った ${queuedForSummaryCount} 件は、要約の生成で作られます:`);
      console.error(
        `   npx tsx scripts/scheduled/manage-summaries.ts generate --days 1 --limit ${queuedForSummaryCount}`
      );
    }

    // 本番の保守ジョブ（Maintenance - Run Script）に出るのはこの形の行だけ
    console.log(`dry_run=${options.dryRun}`);
    console.log(`candidates=${thinArticles.length}`);
    console.log(`updated=${successCount}`);
    console.log(`failed=${failCount}`);
    console.log(`skipped=${skipCount}`);
    console.log(`skipped_source=${skipEnrichmentCount}`);
    console.log(`skipped_concurrent=${concurrentUpdateSkipCount}`);
    console.log(`thumbnails=${thumbnailCount}`);
    console.log(`queued_for_summary=${queuedForSummaryCount}`);
    // 次の回の --skip。今回取れなかった記事（候補に残る）を飛ばし、まだ処理していない記事から始める。
    // ほかの処理と重なって書き込めなかった記事は、その処理が本文を入れて候補から抜けた見込みが高いので、
    // 抜けた側に数える。数え違えたときに、まだ処理していない記事を飛ばすより、取れなかった記事を取り直す側に倒す
    const nextSkip =
      (options.skip ?? 0) + thinArticles.length - resolvedCount - concurrentUpdateSkipCount;
    console.log(`next_skip=${nextSkip}`);

    // 1件も取れずに失敗だけがあれば、失敗として終わる（取得先が拒むようになったなど）
    if (failCount > 0 && successCount === 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      // キャッシュのモジュールが読み込んだ時点で Redis に接続しているので、閉じないとプロセスが終わらない
      await closeRedisConnection();
    }
  }
}

// 引数の誤りなど main の try より前で失敗したときは Redis を閉じる finally を通らないので、終わったら明示して抜ける
if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
