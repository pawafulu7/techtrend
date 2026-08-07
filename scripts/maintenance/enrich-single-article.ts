/**
 * 単一記事のエンリッチメントスクリプト
 * 特定の記事IDを指定してエンリッチメントと要約再生成を実行
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { isEnrichmentSkipped } from '../../lib/fetchers/generic-foreign-rss';

const prisma = createPrismaClient();
const enricher = new GoogleAIEnricher();
const summaryService = new UnifiedSummaryService();

async function enrichSingleArticle(articleId: string) {
  console.error(`=== 単一記事エンリッチメント ===`);
  console.error(`Article ID: ${articleId}`);
  
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

      // CAS: 記事取得時に観測した updatedAt と現在値が一致する場合のみ更新する。
      // enrich() のネットワークI/O中に他プロセス（例: hourly の collect-feeds.ts）が
      // 先に本文を更新している可能性があるため、古いスナップショット基準で
      // 上書きしないための保護（Issue #629 項目6）。
      //
      // CAS トークンに contentLength ではなく updatedAt を使う理由:
      // contentLength は CHAR_LENGTH(content) の派生値のため、(a) 同じ文字数の別本文に
      // 差し替えられた場合（ABA問題）と (b) 本文以外（thumbnail 等）だけが更新された
      // 場合を検出できない。collect-feeds.ts にはサムネイルのみを更新する経路が実在するため
      // (b) は現実に起こりうる。updatedAt は @updatedAt により任意の更新で必ず変化するので、
      // 「取得後に誰かが何かを書いた」ことを漏れなく検出できる。
      //
      // トレードオフ: 逆に本文と無関係な更新でも CAS が失敗する。特に品質スコア再計算
      // （manage-quality-scores.ts / quality-score-batch.ts）は raw SQL で
      // `"updatedAt" = NOW()` を明示セットするため、qualityScore しか変えていなくても
      // ここで敗北する。安全側に倒れるだけで取りこぼしは起きないため許容する。
      const { count } = await prisma.article.updateMany({
        where: { id: articleId, updatedAt: article.updatedAt },
        data: {
          content: enrichedData.content,
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
        }
      });

      if (count === 0) {
        console.error('⏭️  更新スキップ（CAS敗北）: 記事取得後に他プロセスがこの記事を更新したため、今回の取得結果は反映しませんでした');
        console.error('   （本文が更新された場合のほか、品質スコア再計算など本文と無関係な更新でも発生します）');
        console.error('必要であれば記事の最新状態を確認のうえ再実行してください');
        return;
      }

      console.error('データベース更新完了');

      // 要約再生成
      console.error('\n=== 要約再生成 ===');
      
      if (enrichedData.content.length < 100) {
        console.error('⚠️ コンテンツが不十分のため要約再生成をスキップ');
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
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: 7,
            articleType: 'unified'
          }
        });

        if (summaryUpdateCount === 0) {
          // ここで summary をリセットしないのは意図的。本文を書き換えた側
          // （collect-feeds.ts の自己修復パス）が summary / detailedSummary /
          // summaryVersion のリセットまで責務として持つため、こちらでリセットすると
          // 相手が既に生成した正しい要約を消しかねない。
          console.error('⏭️  要約更新スキップ（CAS敗北）: 要約生成中に他プロセスが本文を更新したため、生成結果は保存しませんでした');
          return;
        }

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
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: 7,
              articleType: 'unified'
            }
          });

          if (summaryUpdateCount === 0) {
            console.error('⏭️  要約更新スキップ（CAS敗北）: 要約生成中に他プロセスが本文を更新したため、生成結果は保存しませんでした');
            return;
          }

          console.error('✅ 要約再生成成功（既存コンテンツ使用）');
          console.error(`  詳細要約: ${result.detailedSummary.length}文字`);
        }
      }
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
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