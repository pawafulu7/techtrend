#!/usr/bin/env tsx
import { LocalLLMClient } from '@/lib/ai/local-llm';

async function testJapanese() {
  console.error('🧪 ローカルLLM日本語テスト\n');
  
  const client = new LocalLLMClient({
    url: 'http://192.168.11.7:1234',
    model: 'openai/gpt-oss-20b',
    maxTokens: 200,
    temperature: 0.3
  });
  
  const testTitle = '10 Open Source Tools To Become The Ultimate Developer';
  const testContent = 'This article introduces 10 essential open source tools that can help developers improve their productivity and workflow. The tools cover various aspects of development including code editing, version control, debugging, testing, and deployment.';
  
  console.error('📝 テスト記事:');
  console.error(`タイトル: ${testTitle}`);
  console.error();
  
  try {
    console.error('1️⃣ 要約生成テスト...');
    const startTime = Date.now();
    const summary = await client.generateSummary(testTitle, testContent);
    const elapsed = Date.now() - startTime;
    
    console.error(`✅ 生成完了 (${elapsed}ms)`);
    console.error('要約:', summary);
    console.error('文字数:', summary.length);
    console.error();
    
    console.error('2️⃣ 要約とタグ生成テスト...');
    const startTime2 = Date.now();
    const result = await client.generateSummaryWithTags(testTitle, testContent);
    const elapsed2 = Date.now() - startTime2;
    
    console.error(`✅ 生成完了 (${elapsed2}ms)`);
    console.error('要約:', result.summary);
    console.error('タグ:', result.tags.join(', '));
    console.error();
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

testJapanese().catch(console.error);