#!/usr/bin/env tsx
import { AIService } from '@/lib/ai/ai-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAIService() {
  console.error('🧪 AI Service テスト開始\n');
  
  // AIサービスの初期化
  const aiService = AIService.fromEnv();
  
  // 接続テスト
  console.error('📡 接続テスト中...');
  const connections = await aiService.testConnections();
  console.error('Gemini API:', connections.gemini ? '✅ 接続成功' : '❌ 接続失敗');
  console.error('Local LLM:', connections.localLLM ? '✅ 接続成功' : '❌ 接続失敗');
  console.error();
  
  // テスト用記事を取得
  const article = await prisma.article.findFirst({
    where: {
      content: { not: null },
      source: { name: 'Dev.to' }
    },
    include: { source: true }
  });
  
  if (!article) {
    console.error('テスト用記事が見つかりません');
    process.exit(1);
  }
  
  console.error('📄 テスト記事:');
  console.error(`タイトル: ${article.title}`);
  console.error(`ソース: ${article.source.name}`);
  console.error();
  
  // 要約生成テスト
  try {
    console.error('🌟 Gemini API優先モードでテスト...');
    const startTime = Date.now();
    const result = await aiService.generateSummaryWithTags(
      article.title,
      article.content || ''
    );
    const elapsed = Date.now() - startTime;
    
    console.error(`✅ 生成成功 (${elapsed}ms)`);
    console.error('要約:', result.summary);
    console.error('タグ:', result.tags.join(', '));
    console.error();
  } catch (error) {
    console.error('❌ エラー:', error);
    console.error();
  }
  
  // ローカルLLM優先モードのテスト
  if (process.env.LOCAL_LLM_URL) {
    try {
      console.error('📟 ローカルLLM優先モードでテスト...');
      
      // 環境変数を一時的に変更
      const originalPrefer = process.env.PREFER_LOCAL_LLM;
      process.env.PREFER_LOCAL_LLM = 'true';
      
      const localAIService = AIService.fromEnv();
      const startTime = Date.now();
      const result = await localAIService.generateSummaryWithTags(
        article.title,
        article.content || ''
      );
      const elapsed = Date.now() - startTime;
      
      console.error(`✅ 生成成功 (${elapsed}ms)`);
      console.error('要約:', result.summary);
      console.error('タグ:', result.tags.join(', '));
      console.error();
      
      // 環境変数を元に戻す
      process.env.PREFER_LOCAL_LLM = originalPrefer;
    } catch (error) {
      console.error('❌ エラー:', error);
      console.error();
    }
  }
  
  // フォールバックテスト
  console.error('🔄 フォールバックテスト...');
  console.error('（Gemini APIエラーをシミュレート）');
  
  // 一時的に不正なAPIキーを設定してエラーを発生させる
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'invalid-key';
  process.env.USE_LOCAL_LLM_FALLBACK = 'true';
  
  try {
    const fallbackService = AIService.fromEnv();
    const result = await fallbackService.generateSummaryWithTags(
      article.title,
      article.content || ''
    );
    console.error('✅ フォールバック成功');
    console.error('要約:', result.summary);
    console.error('タグ:', result.tags.join(', '));
  } catch (error) {
    console.error('❌ フォールバックも失敗:', error);
  }
  
  // 環境変数を元に戻す
  process.env.GEMINI_API_KEY = originalApiKey;
  
  console.error('\n✨ テスト完了');
}

testAIService()
  .catch(console.error)
  .finally(() => prisma.$disconnect());