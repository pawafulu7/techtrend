#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function regenerateEmptySummaries() {
  console.log('🔍 詳細要約が空の記事を優先的に再生成\n');
  
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
    
    // 詳細要約が空でコンテンツがある記事を取得
    const emptyArticles = await prisma.article.findMany({
      where: {
        AND: [
          {
            OR: [
              { detailedSummary: null },
              { detailedSummary: '' }
            ]
          },
          {
            content: { not: null }
          }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        publishedAt: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 10 // 10件ずつ処理
    });
    
    console.log(`詳細要約が空の記事: ${emptyArticles.length}件\n`);
    
    if (emptyArticles.length === 0) {
      console.log('✅ 処理対象の記事がありません');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < emptyArticles.length; i++) {
      const article = emptyArticles[i];
      
      console.log(`\n[${i + 1}/${emptyArticles.length}] 処理中: ${article.id}`);
      console.log(`タイトル: ${article.title?.substring(0, 60)}...`);
      console.log(`コンテンツ長: ${article.content?.length}文字`);
      
      if (!article.content || article.content.length < 30) {
        console.log('⚠️ コンテンツが短すぎるためスキップ');
        continue;
      }
      
      try {
        console.log('🤖 ローカルLLMで生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          article.content
        );
        
        const duration = Date.now() - startTime;
        
        // 品質チェック
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.log(`生成時間: ${duration}ms`);
        console.log(`項目数: ${newLines.length}`);
        
        if (newLines.length >= 3) {
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
          
          if (newLines.length === 6) {
            console.log('✅ 6項目で正常に生成されました');
          } else {
            console.log(`✅ ${newLines.length}項目で生成完了`);
          }
          successCount++;
        } else {
          console.log('⚠️ 生成された項目数が少なすぎます');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // 処理間隔を空ける
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('処理完了');
    console.log(`成功: ${successCount}件`);
    console.log(`エラー: ${errorCount}件`);
    
    // 残り件数を確認
    const remainingCount = await prisma.article.count({
      where: {
        OR: [
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      }
    });
    
    console.log(`\n残りの詳細要約なし記事: ${remainingCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateEmptySummaries().catch(console.error);