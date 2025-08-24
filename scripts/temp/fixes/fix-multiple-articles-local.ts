#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixMultipleArticles() {
  const articleIds = [
    "cme0tbaps00bjtevwco2qdlyx",
    "cme0tawdo00bdtevwurt8yahe",
    "cme0tartu00aytevw16elja06",
    "cme0tahvp00aitevwnu5s6wky",
    "cme0lfbb4006ptevwjhk5jyy1",
    "cme0lfamu006itevw9dx50xbe"
  ];
  
  console.error('🤖 ローカルLLMで複数記事を修正\n');
  console.error(`処理対象: ${articleIds.length}件\n`);
  
  try {
    // ローカルLLMクライアントを初期化（maxTokensを増やす）
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 2500,  // 増やして要約が途切れないようにする
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      console.error(`\n[${i + 1}/${articleIds.length}] 処理中: ${articleId}`);
      console.error('='.repeat(60));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
          select: {
            id: true,
            title: true,
            content: true,
            url: true,
            source: true
          }
        });
        
        if (!article) {
          console.error('❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        console.error(`タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`ソース: ${article.source}`);
        
        // コンテンツを強化（短い場合）
        let enhancedContent = article.content || '';
        if (enhancedContent.length < 200) {
          enhancedContent = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source}

Article Summary:
${article.content || 'この記事は外部サイトの記事です。'}

Context: This is a technical article that discusses modern software development practices, tools, and methodologies. Please provide a comprehensive summary and analysis based on the title and available information.
          `.trim();
        }
        
        console.error(`コンテンツ長: ${enhancedContent.length}文字`);
        
        console.error('🔄 詳細要約を生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          enhancedContent
        );
        
        const duration = Date.now() - startTime;
        console.error(`生成時間: ${duration}ms`);
        
        // 品質チェック
        const lines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const summaryComplete = result.summary && 
                               result.summary.endsWith('。') && 
                               result.summary.length >= 60;
        
        console.error(`要約: ${result.summary.substring(0, 50)}...`);
        console.error(`要約完全性: ${summaryComplete ? '✅' : '⚠️'} (${result.summary.length}文字)`);
        console.error(`詳細項目数: ${lines.length}`);
        
        if (lines.length >= 5 && summaryComplete) {
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
            where: { id: articleId },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              tags: {
                set: tagConnections
              },
              updatedAt: new Date()
            }
          });
          
          console.error('✅ 更新完了');
          successCount++;
        } else {
          console.error('⚠️ 品質が不十分なためスキップ');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMultipleArticles().catch(console.error);