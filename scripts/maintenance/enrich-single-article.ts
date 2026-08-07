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

      // CAS: 記事取得時に観測した contentLength と現在値が一致する場合のみ更新する。
      // enrich() のネットワークI/O中に他プロセス（例: hourly の collect-feeds.ts）が
      // 先に本文を更新している可能性があるため、古いスナップショット基準で
      // 上書きしないための保護（Issue #629 項目6、collect-feeds.ts の自己修復パスと同一方針）。
      const { count } = await prisma.article.updateMany({
        where: { id: articleId, contentLength: article.contentLength },
        data: {
          content: enrichedData.content,
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
        }
      });

      if (count === 0) {
        console.error('⏭️  更新スキップ（CAS敗北）: 記事取得後、他プロセスが既に本文を更新済みのため、今回の取得結果は反映しませんでした');
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
        await prisma.article.update({
          where: { id: articleId },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: 7,
            articleType: 'unified'
          }
        });
        
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
          await prisma.article.update({
            where: { id: articleId },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: 7,
              articleType: 'unified'
            }
          });
          
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