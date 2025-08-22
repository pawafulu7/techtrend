/**
 * 単一記事のエンリッチメントスクリプト
 * 特定の記事IDを指定してエンリッチメントと要約再生成を実行
 */

import { PrismaClient } from '@prisma/client';
import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const enricher = new GoogleAIEnricher();
const summaryService = new UnifiedSummaryService();

async function enrichSingleArticle(articleId: string) {
  console.log(`=== 単一記事エンリッチメント ===`);
  console.log(`Article ID: ${articleId}`);
  
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
    
    console.log(`\nタイトル: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`現在のコンテンツ長: ${article.content?.length || 0}文字`);
    console.log(`現在の詳細要約長: ${article.detailedSummary?.length || 0}文字`);
    
    // エンリッチメント実行
    console.log('\n=== エンリッチメント実行 ===');
    
    if (!enricher.canHandle(article.url)) {
      console.log('警告: URLがエンリッチャーの対象外ですが、強制実行を試みます');
    }
    
    const enrichedData = await enricher.enrich(article.url);
    
    if (enrichedData && enrichedData.content) {
      const newLength = enrichedData.content.length;
      console.log(`✅ エンリッチメント成功: ${newLength}文字`);
      
      // データベース更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          content: enrichedData.content,
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
        }
      });
      
      console.log('データベース更新完了');
      
      // 要約再生成
      console.log('\n=== 要約再生成 ===');
      
      if (enrichedData.content.length < 100) {
        console.log('⚠️ コンテンツが不十分のため要約再生成をスキップ');
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
        
        console.log('✅ 要約再生成成功');
        console.log(`  一覧要約: ${result.summary.length}文字`);
        console.log(`  詳細要約: ${result.detailedSummary.length}文字`);
        
        // 詳細要約の最初の3行を表示
        const lines = result.detailedSummary.split('\n').slice(0, 3);
        lines.forEach(line => {
          console.log(`  ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
        });
      } else {
        console.log('❌ 要約再生成失敗');
      }
      
    } else {
      console.log('❌ エンリッチメント失敗');
      
      // エンリッチメント失敗でも、既存コンテンツで要約再生成を試みる
      if (article.content && article.content.length >= 100) {
        console.log('\n既存コンテンツで要約再生成を試みます...');
        
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
          
          console.log('✅ 要約再生成成功（既存コンテンツ使用）');
          console.log(`  詳細要約: ${result.detailedSummary.length}文字`);
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