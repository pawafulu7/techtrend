/**
 * 薄いコンテンツの記事をContentEnricherで更新するスクリプト
 * 
 * 使用方法:
 * npx tsx scripts/manual/enrich-thin-content.ts [options]
 * 
 * オプション:
 * --dry-run        実際の更新を行わずにシミュレーション
 * --source=xxx     特定のソースのみ処理
 * --limit=n        処理する記事数を制限
 * --skip=n         最初のn件をスキップ（継続処理用）
 * --skip-summary   要約のリセットをスキップ
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { ContentEnricherFactory } from '../../lib/enrichers';
import { isEnrichmentSkipped } from '../../lib/fetchers/generic-foreign-rss';
import { isHighQuality } from '../../lib/enrichers/strategies/quality';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = createPrismaClient();

interface Options {
  dryRun: boolean;
  source?: string;
  limit?: number;
  skip?: number;
  skipSummary: boolean;
}

/**
 * CAS（Compare-And-Swap）更新の最大試行回数。
 *
 * updatedAt を CAS トークンに使うため、本文と無関係な更新（品質スコア再計算など）
 * でも敗北しうる。1回で諦めると取りこぼしが増えるので、記事を再取得して数回まで
 * 再試行する。
 */
const MAX_CAS_ATTEMPTS = 3;

interface ThinContentCandidateArticle {
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
 * - 本文はあるが500文字未満の記事は、既にサムネイルを取得済み（Speaker Deck除く）であれば
 *   ContentEnricherによる処理済みとみなし、従来通り除外する。
 */
export function isThinContentCandidate(article: ThinContentCandidateArticle): boolean {
  const content = article.content;

  if (!content) {
    // 本文が完全に空: サムネイル有無に関わらず対象
    return true;
  }

  if (content.length >= 500) {
    return false;
  }

  // 本文はあるが薄い（1〜499文字）: サムネイル取得済みなら処理済みとみなす
  const hasEnrichedThumbnail = Boolean(article.thumbnail) && article.source.name !== 'Speaker Deck';
  return !hasEnrichedThumbnail;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    skipSummary: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--source=')) {
      options.source = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--skip=')) {
      options.skip = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--skip-summary') {
      options.skipSummary = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  
  console.error('========================================');
  console.error('薄いコンテンツのエンリッチメント');
  console.error('========================================');
  console.error('オプション:', {
    dryRun: options.dryRun ? 'Yes' : 'No',
    source: options.source || 'All',
    limit: options.limit || 'No limit',
    skip: options.skip || 0,
    skipSummary: options.skipSummary ? 'Yes' : 'No',
  });
  console.error('');

  if (options.dryRun) {
    console.error('⚠️  ドライランモード: 実際の更新は行いません');
    console.error('');
  }

  try {
    // 薄いコンテンツの記事を取得
    const whereCondition: any = {
      OR: [
        { content: null },
        { content: '' },
        // SQLiteでは LENGTH 関数を直接使えないため、後でフィルタリング
      ],
    };

    if (options.source) {
      whereCondition.source = {
        name: options.source,
      };
    }

    // 記事を取得
    const articles = await prisma.article.findMany({
      where: whereCondition,
      include: {
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: options.limit || undefined,
    });

    // コンテンツが500文字未満の記事もフィルタリング
    const allThinArticles = await prisma.article.findMany({
      where: options.source ? { source: { name: options.source } } : {},
      include: {
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    // 500文字未満の記事を抽出（既に処理済みの記事は除外）
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
    
    if (thinArticles.length === 0) {
      console.error('処理対象の記事がありません。');
      return;
    }

    const enricherFactory = new ContentEnricherFactory();
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let thumbnailCount = 0;
    let skipEnrichmentCount = 0;
    let concurrentUpdateSkipCount = 0;

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

        const hasNewContent = enrichedData.content && enrichedData.content.length > (article.content?.length || 0);
        const hasNewThumbnail = enrichedData.thumbnail && !article.thumbnail;

        if (!hasNewContent && !hasNewThumbnail) {
          console.error(`  ⏭️  スキップ: 新しいデータがありません`);
          skipCount++;
          continue;
        }

        console.error(`  ✅ エンリッチ成功:`);
        if (hasNewContent) {
          console.error(`    - コンテンツ: ${article.content?.length || 0} → ${enrichedData.content?.length}文字`);
        }
        if (hasNewThumbnail) {
          console.error(`    - サムネイル: 取得成功`);
          thumbnailCount++;
        }

        if (!options.dryRun) {
          // データベースを更新
          const updateData: any = {};
          
          if (hasNewContent) {
            updateData.content = enrichedData.content;
            if (!options.skipSummary) {
              // 要約をリセット（再生成が必要）
              updateData.summary = null;
              updateData.detailedSummary = null;
              // summaryVersionはnullableでないため、0に設定
              updateData.summaryVersion = 0;
              console.error(`    - 要約: リセット（再生成が必要）`);
            }
            // 本文回復時は本文起因の skipReason（THIN_CONTENT / CONTENT_FETCH_FAILED /
            // QUALITY_FAILED）と summaryError をクリアし、scripts:summarize
            // （skipReason: null 対象）で要約再生成されるようにする。
            // PDF / SLIDE は本文の有無と無関係の恒久理由のためクリアしない。
            // skipReason が null で summaryError だけ残るケース（一時的な要約失敗）
            // もクリア対象にするため truthy 判定はしない。
            // collect-feeds.ts の受入基準と同一（500文字以上は無条件、
            // 250-499文字は isHighQuality 必須）にし、わずかな伸びでの
            // クリアを防ぐ
            if (
              (enrichedData.content.length >= 500 ||
                (enrichedData.content.length >= 250 && isHighQuality(enrichedData.content))) &&
              article.skipReason !== 'PDF' &&
              article.skipReason !== 'SLIDE'
            ) {
              updateData.skipReason = null;
              updateData.summaryError = null;
            }
          }
          
          if (hasNewThumbnail) {
            updateData.thumbnail = enrichedData.thumbnail;
          }

          // CAS: 記事読み込み時に観測した updatedAt と現在値が一致する場合のみ更新する。
          // hourly の collect-feeds.ts 等、他プロセスがこの間により良い本文を書き込んで
          // いた場合に、古いスナップショット基準で上書きしないための保護（Issue #629 項目6）。
          //
          // CAS トークンに contentLength ではなく updatedAt を使う理由:
          // contentLength は CHAR_LENGTH(content) の派生値のため、(a) 同じ文字数の別本文に
          // 差し替えられた場合（ABA問題）と (b) 本文以外だけが更新された場合を検出できない。
          // 本スクリプトの updateData は thumbnail も含みうるうえ、collect-feeds.ts には
          // サムネイルのみを更新する経路が実在するため (b) は現実に起こりうる。
          // updatedAt は @updatedAt により任意の更新で必ず変化するので、「読み込み後に
          // 誰かが何かを書いた」ことを漏れなく検出できる。
          //
          // トレードオフ: 逆に本文と無関係な更新でも CAS が失敗する。特に品質スコア再計算
          // （manage-quality-scores.ts / quality-score-batch.ts）は raw SQL で
          // `"updatedAt" = NOW()` を明示セットするため、qualityScore しか変えていなくても
          // ここで敗北する。この誤失敗による取りこぼしを避けるため、敗北時は記事を
          // 再取得して上限付きで再試行する。
          //
          // 再試行時に enrich をやり直さないのは意図的。再取得後に
          // isThinContentCandidate で「まだ薄いまま」であることを確認しており、
          // その場合エンリッチ結果は依然として有効なため、外部への再フェッチは
          // レート制限とレイテンシのコストに見合わない。逆に他プロセスが十分な本文を
          // 書き込んでいた場合は候補判定で弾かれ、こちらの結果で上書きすることはない。
          let casUpdated = false;
          let supersededByOtherProcess = false;
          let casTargetUpdatedAt: Date = article.updatedAt;

          for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
            const { count } = await prisma.article.updateMany({
              where: {
                id: article.id,
                updatedAt: casTargetUpdatedAt,
              },
              data: updateData,
            });

            if (count > 0) {
              casUpdated = true;
              break;
            }

            if (attempt === MAX_CAS_ATTEMPTS) break;

            await new Promise(resolve => setTimeout(resolve, 500 * attempt));

            const fresh = await prisma.article.findUnique({
              where: { id: article.id },
              include: { source: true },
            });

            if (!fresh || !isThinContentCandidate(fresh)) {
              // 他プロセスが十分な本文を書き込んだ（または記事が消えた）ため、
              // こちらの結果を書く必要がなくなった
              supersededByOtherProcess = true;
              break;
            }

            casTargetUpdatedAt = fresh.updatedAt;
            console.error(`  🔁 CAS敗北（${attempt}/${MAX_CAS_ATTEMPTS}回目）: 記事を再取得して再試行します`);
          }

          if (casUpdated) {
            console.error(`  💾 データベース更新完了`);
            successCount++;
          } else if (supersededByOtherProcess) {
            console.error(`  ⏭️  スキップ: 他プロセスが先に本文を補完したか記事が削除されたため、この記事は対象外になりました`);
            skipCount++;
          } else {
            console.error(`  ⏭️  スキップ（CAS敗北）: ${MAX_CAS_ATTEMPTS}回試行しましたが、他プロセスの更新と競合し続けたためスキップしました`);
            concurrentUpdateSkipCount++;
          }
        } else {
          successCount++;
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`  ❌ エラー:`, error);
        failCount++;
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
    console.error(`⏭️  スキップ（並行更新でCAS敗北）: ${concurrentUpdateSkipCount}件`);
    if (concurrentUpdateSkipCount > 0) {
      console.error('   ※ 本文更新のほか、品質スコア再計算など本文と無関係な更新でも発生します。再実行で回収できます');
    }
    console.error(`🖼️  サムネイル取得: ${thumbnailCount}件`);
    console.error(`📊 合計: ${thinArticles.length}件`);

    if (options.dryRun) {
      console.error('\n⚠️  ドライランモードのため、実際の更新は行われませんでした。');
      console.error('本番実行するには --dry-run オプションを外してください。');
    } else if (successCount > 0 && !options.skipSummary) {
      console.error('\n📝 要約の再生成が必要です:');
      console.error('   npm run scripts:summarize');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}