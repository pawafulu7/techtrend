#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function regenerateWithLocalLLM() {
  console.log('🤖 ローカルLLMで問題のある記事を再生成\n');
  console.log('='.repeat(60));
  
  try {
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 1500,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
    // 3項目しかない記事を取得（最近のもの）
    const problemArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7日以内
        }
      },
      select: {
        id: true,
        title: true,
        content: true,
        detailedSummary: true
      }
    });
    
    // 3項目の記事をフィルタリング
    const shortSummaryArticles = problemArticles.filter(article => {
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
      return lines.length === 3 && article.content && article.content.length > 50;
    });
    
    console.log(`3項目の詳細要約を持つ記事: ${shortSummaryArticles.length}件\n`);
    
    // 最初の5件を処理
    const targetArticles = shortSummaryArticles.slice(0, 5);
    
    let successCount = 0;
    
    for (const article of targetArticles) {
      console.log(`\n処理中: ${article.id}`);
      console.log(`タイトル: ${article.title?.substring(0, 60)}...`);
      console.log(`コンテンツ長: ${article.content?.length}文字`);
      
      try {
        console.log('🔄 ローカルLLMで詳細要約を生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          article.content || ''
        );
        
        const duration = Date.now() - startTime;
        
        // 品質チェック
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.log(`生成時間: ${duration}ms`);
        console.log(`項目数: ${newLines.length}`);
        
        if (newLines.length === 6) {
          // タグを準備
          const tagConnections = await Promise.all(
            result.tags.map(async (tagName) => {
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { 
                  name: tagName, 
                  category: null 
                }
              });
              return { id: tag.id };
            })
          );
          
          // データベースを更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              tags: {
                set: tagConnections
              },
              updatedAt: new Date()
            }
          });
          
          console.log('✅ 6項目で正常に再生成されました');
          successCount++;
        } else {
          console.log(`⚠️ 項目数が期待値と異なります: ${newLines.length}項目`);
        }
        
      } catch (error) {
        console.error(`❌ エラー: ${error}`);
      }
      
      console.log('-'.repeat(60));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('処理完了');
    console.log(`成功: ${successCount}/${targetArticles.length}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateWithLocalLLM().catch(console.error);