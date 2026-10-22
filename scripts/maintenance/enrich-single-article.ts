/**
 * 単一記事のエンリッチメントスクリプト
 * 特定の記事IDを指定してエンリッチメントと要約再生成を実行
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { isEnrichmentSkipped } from '../../lib/fetchers/generic-foreign-rss';
import {
  contentStateWhere,
  summaryUpdatesForReplacedContent,
} from '../scheduled/utils/summary-reset';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import { closeRedisConnection } from '@/lib/redis/client';

const prisma = createPrismaClient();
const enricher = new GoogleAIEnricher();
const summaryService = new UnifiedSummaryService();
const embeddingScheduler = new EmbeddingScheduler(prisma);

type GeneratedSummary = Awaited<ReturnType<UnifiedSummaryService['generate']>>;

/**
 * 生成した要約を保存する内容。定期実行の要約生成（batch-processor）と同じ状態を書く。
 * 本文の差し替えで summaryComputedAt を null に戻しているので、書かないと一覧に出ない
 */
function summarySavedData(result: GeneratedSummary) {
  return {
    summary: result.summary,
    detailedSummary: result.detailedSummary,
    summaryVersion: result.summaryVersion,
    articleType: 'unified',
    summaryComputedAt: new Date(),
    summaryError: null,
    skipReason: null,
  };
}

/** 要約を保存できたときだけ、保存の後に埋め込みのジョブを積み、表示のキャッシュを消す */
async function afterSummarySaved(articleId: string, result: GeneratedSummary): Promise<void> {
  await embeddingScheduler.enqueue(articleId);
  await cacheInvalidator.onArticleUpdated(articleId, {
    summary: result.summary,
    detailedSummary: result.detailedSummary,
  });
}

async function enrichSingleArticle(articleId: string) {
  console.error(`=== 単一記事エンリッチメント ===`);
  console.error(`Article ID: ${articleId}`);
  // 本文か要約を書いたか（最後に一覧のキャッシュを消すかどうか）
  let written = false;

  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });
    
    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      return;
    }
    
    console.error(`\nタイトル: ${article.title}`);
    console.error(`URL: ${article.url}`);
    console.error(`現在のコンテンツ長: ${article.content?.length || 0}文字`);
    console.error(`現在の詳細要約長: ${article.detailedSummary?.length || 0}文字`);
    
    // エンリッチメント実行
    console.error('\n=== エンリッチメント実行 ===');

    // skipEnrichment 対象ソース（enricher による本文上書きを行わない）は中断
    if (isEnrichmentSkipped(article.source.name)) {
      console.error(
        `中断: ソース「${article.source.name}」は設定（skipEnrichment）により本文上書き対象外です`
      );
      return;
    }

    if (!enricher.canHandle(article.url)) {
      console.error('警告: URLがエンリッチャーの対象外ですが、強制実行を試みます');
    }
    
    const enrichedData = await enricher.enrich(article.url);
    
    if (enrichedData && enrichedData.content) {
      const newLength = enrichedData.content.length;
      console.error(`✅ エンリッチメント成功: ${newLength}文字`);

      // CAS: 記事取得時と本文の状態（contentLength・contentUpdatedAt）が同じ場合のみ更新する。
      // enrich() のネットワークI/O中に他プロセス（例: hourly の collect-feeds.ts）が
      // 先に本文を更新している可能性があるため、古いスナップショット基準で
      // 上書きしないための保護（Issue #629 項目6）。
      //
      // 以前は updatedAt を CAS トークンにしていたが、updatedAt はマイクロ秒の精度で、
      // 品質スコア再計算（manage-quality-scores.ts など）が raw SQL の NOW() で書くため、
      // ミリ秒の JavaScript の Date と一致せず、誰も更新していなくても敗北していた
      // （開発 DB で約半数の記事）。contentLength は本文の長さの変化を、contentUpdatedAt は
      // 同じ長さの差し替えを拾う（contentStateWhere）。本文以外（thumbnail 等）だけの
      // 並行更新は検出しないが、上書きしても本文の整合は崩れない。
      // 本文を差し替えると、既存の summary / detailedSummary は古い本文に基づく内容に
      // なる。直後に要約を再生成するが、生成に失敗した場合や本文が短くて生成をスキップ
      // した場合に「新本文 + 旧要約」が残らないよう、本文更新と同一の CAS 更新で
      // 要約をリセットしておく（collect-feeds.ts の自己修復パスと同じ流儀）。
      // リセットしておけば、このスクリプトでの再生成に失敗しても定期の要約生成ジョブが
      // 再生成対象として拾える。
      // PDF / SLIDE は対象外。skipReason / summaryError は新しい本文が保存の基準を満たすときだけ
      // 消し、要約は基準に関わらず消す（summaryUpdatesForReplacedContent。collect-feeds.ts・
      // 他の保守スクリプトと同じ扱い）
      const { count } = await prisma.article.updateMany({
        where: { id: articleId, ...contentStateWhere(article) },
        data: {
          content: enrichedData.content,
          // 本文を更新する他の全経路（collect-feeds.ts、re-enrich-*.ts）と同様に
          // contentUpdatedAt を進める。manage-quality-scores.ts は contentUpdatedAt の
          // 差分で品質スコア再計算の対象を抽出するため、更新しないと本文が変わったのに
          // 品質スコアが古いまま残る。
          contentUpdatedAt: new Date(),
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail }),
          ...summaryUpdatesForReplacedContent(article.skipReason, enrichedData.content)
        }
      });

      if (count === 0) {
        console.error('⏭️  更新スキップ（CAS敗北）: 記事取得後に他プロセスがこの記事の本文を更新したため、今回の取得結果は反映しませんでした');
        console.error('必要であれば記事の最新状態を確認のうえ再実行してください');
        return;
      }

      console.error('データベース更新完了');
      written = true;
      // 本文を差し替え、要約をリセットしたので、記事の表示のキャッシュを消す
      await cacheInvalidator.onArticleUpdated(articleId);

      // 要約再生成
      console.error('\n=== 要約再生成 ===');
      
      if (enrichedData.content.length < 100) {
        // 本文更新時に要約はリセット済みのため、「新本文 + 旧要約」は残らない。
        // 本文が十分に伸びた時点で定期の要約生成ジョブが生成する。
        console.error('⚠️ コンテンツが不十分のため要約再生成をスキップ（既存要約はリセット済み）');
        return;
      }
      
      const result = await summaryService.generate(
        article.title,
        enrichedData.content,
        undefined,
        {
          sourceName: article.source.name,
          url: article.url
        }
      );
      
      if (result) {
        // CAS: 要約は enrichedData.content から生成されたものなので、その本文が
        // まだ記事に残っている場合のみ保存する。要約生成（LLM呼び出し）の間に
        // 他プロセスが本文を差し替えていた場合、新しい本文に古い要約が結び付くのを防ぐ。
        // 直前の本文更新で updatedAt は変化済みのため、ここでは自分が書いた本文自体を
        // CAS トークンとして使う（更新後の updatedAt を取り直す必要がない）。
        const { count: summaryUpdateCount } = await prisma.article.updateMany({
          where: { id: articleId, content: enrichedData.content },
          data: summarySavedData(result)
        });

        if (summaryUpdateCount === 0) {
          // 本文はこちらが書いたものではなくなっているため、生成結果は破棄する。
          // summary は本文更新時に既にリセット済みであり、本文を書き換えた側
          // （collect-feeds.ts の自己修復パス）も同様にリセットするため、
          // 「新本文 + 旧要約」の状態は残らない。定期の要約生成ジョブが再生成する。
          console.error('⏭️  要約更新スキップ（CAS敗北）: 要約生成中に他プロセスが本文を更新したため、生成結果は保存しませんでした');
          return;
        }

        written = true;
        await afterSummarySaved(articleId, result);

        console.error('✅ 要約再生成成功');
        console.error(`  一覧要約: ${result.summary.length}文字`);
        console.error(`  詳細要約: ${result.detailedSummary.length}文字`);
        
        // 詳細要約の最初の3行を表示
        const lines = result.detailedSummary.split('\n').slice(0, 3);
        lines.forEach(line => {
          console.error(`  ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
        });
      } else {
        console.error('❌ 要約再生成失敗');
      }
      
    } else {
      console.error('❌ エンリッチメント失敗');
      
      // エンリッチメント失敗でも、既存コンテンツで要約再生成を試みる
      if (article.content && article.content.length >= 100) {
        console.error('\n既存コンテンツで要約再生成を試みます...');
        
        const result = await summaryService.generate(
          article.title,
          article.content,
          undefined,
          {
            sourceName: article.source.name,
            url: article.url
          }
        );
        
        if (result) {
          // CAS: 要約は取得時点の article.content から生成したものなので、その本文が
          // まだ残っている場合のみ保存する。要約生成（LLM呼び出し）中に他プロセスが
          // 本文を更新していた場合、新しい本文に古い要約が結び付くのを防ぐ。
          const { count: summaryUpdateCount } = await prisma.article.updateMany({
            where: { id: articleId, content: article.content },
            data: summarySavedData(result)
          });

          if (summaryUpdateCount === 0) {
            console.error('⏭️  要約更新スキップ（CAS敗北）: 要約生成中に他プロセスが本文を更新したため、生成結果は保存しませんでした');
            return;
          }

          written = true;
          await afterSummarySaved(articleId, result);

          console.error('✅ 要約再生成成功（既存コンテンツ使用）');
          console.error(`  詳細要約: ${result.detailedSummary.length}文字`);
        }
      }
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    if (written) {
      // onArticleUpdated は一覧のキャッシュを消さないので、本文か要約を書いたら最後に一覧のキャッシュも
      // 消す（collect-feeds の要約生成の後と同じ）。失敗を投げるが、書き込みは済んでいるので警告に留める
      try {
        await cacheInvalidator.onBulkImport();
      } catch (cacheError) {
        console.error('警告: 一覧のキャッシュの無効化に失敗しました（TTL で切れます）:', cacheError);
      }
    }
    try {
      await prisma.$disconnect();
    } finally {
      // キャッシュのモジュールが読み込んだ時点で Redis に接続しているので、閉じないとプロセスが終わらない
      await closeRedisConnection();
    }
  }
}

// コマンドライン引数から記事IDを取得
const articleId = process.argv[2];

if (!articleId) {
  console.error('使用方法: npx tsx scripts/maintenance/enrich-single-article.ts <article-id>');
  process.exit(1);
}

// 実行
enrichSingleArticle(articleId).catch(console.error);