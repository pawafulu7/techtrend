#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';
import { AIService } from '../lib/ai/ai-service';

const prisma = new PrismaClient();

async function regenerateFailedSummaries() {
  console.error('🔍 詳細要約の生成に失敗している記事を検索中...\n');
  
  try {
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 1500,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // ローカルLLM接続確認
    const connected = await localLLM.testConnection();
    const useLocalLLM = connected;
    
    if (useLocalLLM) {
      console.error('✅ ローカルLLMサーバー接続成功\n');
    } else {
      console.error('⚠️ ローカルLLM未接続、Gemini APIを使用します\n');
    }
    
    // Gemini APIサービス（フォールバック用）
    const aiService = AIService.fromEnv();
    
    // 詳細要約が失敗している記事を検索
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        publishedAt: true,
        sourceId: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    // 詳細要約の項目数をチェック
    const articlesWithContent = await prisma.article.findMany({
      where: {
        content: { not: null },
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30日以内
        }
      },
      select: {
        id: true,
        title: true,
        content: true,
        detailedSummary: true,
        url: true,
        publishedAt: true
      }
    });
    
    // 3項目以下の記事も含める
    const failedArticles = [
      ...articles,
      ...articlesWithContent.filter(article => {
        const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
        return lines.length < 4; // 3項目以下
      })
    ];
    
    // 重複を除去
    const uniqueArticles = Array.from(
      new Map(failedArticles.map(a => [a.id, a])).values()
    );
    
    console.error(`詳細要約が失敗している記事: ${uniqueArticles.length}件\n`);
    
    if (uniqueArticles.length === 0) {
      console.error('✅ すべての記事に詳細要約があります');
      return;
    }
    
    // 処理数を制限（最大10件）
    const targetArticles = uniqueArticles.slice(0, 10);
    console.error(`処理対象: ${targetArticles.length}件\n`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      
      console.error(`\n[${i + 1}/${targetArticles.length}] 処理中: ${article.id}`);
      console.error(`タイトル: ${article.title?.substring(0, 60)}...`);
      console.error(`公開日: ${article.publishedAt?.toISOString()}`);
      
      if (!article.content) {
        console.error('⚠️ コンテンツがないためスキップ');
        skipCount++;
        continue;
      }
      
      console.error(`コンテンツ長: ${article.content.length}文字`);
      
      try {
        let result;
        
        if (useLocalLLM && article.content.length > 50) {
          // ローカルLLMを優先使用（短すぎる記事は除外）
          console.error('🤖 ローカルLLMで生成中...');
          const startTime = Date.now();
          result = await localLLM.generateDetailedSummary(
            article.title || '',
            article.content
          );
          const duration = Date.now() - startTime;
          console.error(`生成時間: ${duration}ms`);
        } else {
          // Gemini APIを使用
          console.error('🌟 Gemini APIで生成中...');
          result = await aiService.generateDetailedSummary(
            article.title || '',
            article.content
          );
        }
        
        // 品質チェック
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.error(`項目数: ${newLines.length}`);
        
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
            console.error('✅ 6項目で正常に生成されました');
          } else {
            console.error(`✅ ${newLines.length}項目で生成完了`);
          }
          successCount++;
        } else {
          console.error('⚠️ 生成された項目数が少なすぎます');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
        
        // レート制限エラーの場合は待機
        if (error.message?.includes('503') || error.message?.includes('overload')) {
          console.error('⏳ レート制限のため30秒待機...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`スキップ: ${skipCount}件`);
    console.error(`エラー: ${errorCount}件`);
    console.error(`残り: ${uniqueArticles.length - targetArticles.length}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
regenerateFailedSummaries().catch(console.error);