#!/usr/bin/env tsx
import fetch from 'node-fetch';

async function testDirectPrompt() {
  console.error('🧪 Local LLM プロンプト直接テスト\n');
  
  const url = 'http://192.168.11.7:1234';
  
  const testPrompts = [
    {
      name: 'シンプルな指示',
      messages: [
        {
          role: 'system',
          content: '日本語で簡潔に回答してください。'
        },
        {
          role: 'user',
          content: 'Next.js 14の主要な新機能を60-80文字で要約してください。'
        }
      ]
    },
    {
      name: '強い制約付き',
      messages: [
        {
          role: 'system',
          content: '以下のルールを厳守してください：\n1. 必ず日本語で回答\n2. 思考過程を出力しない\n3. 要求された内容のみ出力'
        },
        {
          role: 'user',
          content: '次の内容を60-80文字の日本語で要約してください。余計な説明は不要です。\n\nNext.js 14では、App RouterとServer Actionsが導入され、サーバーコンポーネントの活用により初期ロード時間を最大30%削減し、フォーム処理のレイテンシを50%改善します。'
        }
      ]
    },
    {
      name: '出力形式指定',
      messages: [
        {
          role: 'system',
          content: 'あなたは日本語の要約生成アシスタントです。指定された形式のみ出力してください。'
        },
        {
          role: 'user',
          content: '以下の文章を要約してください。出力は「要約:」で始まる1行のみとしてください。\n\nNext.js 14の新機能により、開発者はより効率的にWebアプリケーションを構築できます。'
        }
      ]
    }
  ];

  for (const prompt of testPrompts) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`📝 テスト: ${prompt.name}`);
    console.error('='.repeat(60));
    
    try {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: prompt.messages,
          max_tokens: 800,
          temperature: 0.3,
        }),
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content || '';
        
        console.error(`\n応答: ${content}`);
        console.error(`文字数: ${content.length}文字`);
        
        // 品質チェック
        const hasEnglishThinking = /need|chars|count|let's/i.test(content);
        console.error(`英語の思考過程: ${hasEnglishThinking ? '含まれる ❌' : '含まれない ✅'}`);
      } else {
        console.error('❌ エラー:', await response.text());
      }
    } catch (error) {
      console.error('❌ エラー:', error);
    }
  }
  
  console.error('\n' + '='.repeat(60));
  console.error('📊 分析結果');
  console.error('='.repeat(60));
  console.error('Local LLMの特性:');
  console.error('- 英語の思考過程が出力に混入しやすい');
  console.error('- システムメッセージの効果が限定的');
  console.error('- プロンプトエンジニアリングでの制御が難しい');
  console.error('\n対策案:');
  console.error('1. 後処理で英語部分を除去');
  console.error('2. より強力なLocal LLMモデルの使用');
  console.error('3. Few-shot promptingの活用');
}

testDirectPrompt().catch(console.error);