#!/usr/bin/env tsx
import fetch from 'node-fetch';

async function testLocalLLM() {
  console.log('🧪 ローカルLLM接続テスト\n');
  
  const url = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  
  console.log(`URL: ${url}`);
  console.log('環境変数 LOCAL_LLM_URL:', process.env.LOCAL_LLM_URL);
  console.log('環境変数 LOCAL_LLM_MODEL:', process.env.LOCAL_LLM_MODEL);
  console.log('環境変数 USE_LOCAL_LLM_FALLBACK:', process.env.USE_LOCAL_LLM_FALLBACK);
  console.log();
  
  // 1. モデル一覧取得テスト
  console.log('📡 モデル一覧取得テスト...');
  try {
    const response = await fetch(`${url}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Status:', response.status);
    console.log('OK:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('モデル数:', data.data?.length || 0);
      if (data.data && data.data.length > 0) {
        console.log('利用可能モデル:');
        data.data.forEach((model: any) => {
          console.log(`  - ${model.id}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  }
  
  console.log();
  
  // 2. チャット補完テスト
  console.log('💬 チャット補完テスト...');
  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'user',
            content: 'Hello, please respond with "Hi there!" only.'
          }
        ],
        max_tokens: 10,
        temperature: 0.1,
      }),
    });
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ 応答:', data.choices?.[0]?.message?.content);
    } else {
      console.log('❌ エラー:', await response.text());
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

testLocalLLM().catch(console.error);