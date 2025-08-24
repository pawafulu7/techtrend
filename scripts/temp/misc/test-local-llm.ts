import fetch from 'node-fetch';

// LM Studio APIのエンドポイント
// socatでポートフォワードしている場合はlocalhost、直接接続の場合はWindows Host IP
const USE_PORT_FORWARD = false; // socatを使う場合はtrue、直接接続の場合はfalse
const WINDOWS_HOST = '10.255.255.254';
const LM_STUDIO_URL = USE_PORT_FORWARD 
  ? 'http://localhost:1234/v1/chat/completions'
  : `http://${WINDOWS_HOST}:1234/v1/chat/completions`;

// テスト用の記事データ
const TEST_ARTICLE = {
  title: "Next.js 14でApp Routerを使った効率的なルーティング設定方法",
  content: `
Next.js 14のApp Routerは、従来のPages Routerと比較して、より直感的で柔軟なルーティングシステムを提供します。
この記事では、App Routerの基本的な使い方から、動的ルーティング、レイアウトの共有、ローディング状態の管理まで、実践的な例を交えて解説します。

主な内容：
- ファイルベースのルーティング構造
- 動的セグメントとキャッチオールルート
- レイアウトとテンプレートの違い
- ローディングUIとエラーハンドリング
- サーバーコンポーネントとクライアントコンポーネントの使い分け

App Routerを使うことで、パフォーマンスの向上とより良い開発体験を実現できます。
  `.trim()
};

// 要約生成のプロンプト
function createSummaryPrompt(title: string, content: string): string {
  return `
以下の技術記事について、日本語で要約とタグを生成してください。

記事タイトル: ${title}
記事内容: ${content}

以下の形式で出力してください：

要約: 100-150文字の日本語で記事の主要なポイントを簡潔にまとめてください。

詳細要約: 200-300文字の日本語で、記事が解決する問題、主要な内容、得られる知識などを含めて説明してください。箇条書きを使っても構いません。

タグ: 記事に関連する技術タグを5個以内でカンマ区切りで出力してください。
`.trim();
}

// LM StudioのAPIを呼び出す関数
async function callLocalLLM(prompt: string): Promise<string> {
  try {
    const response = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'local-model', // LM Studioで読み込んでいるモデル名
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling LM Studio API:', error);
    throw error;
  }
}

// レスポンスのパース関数
function parseSummaryAndTags(text: string): {
  summary: string;
  detailedSummary: string;
  tags: string[];
} {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  
  let currentSection = '';
  const detailedLines: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('要約:') || line.startsWith('要約：')) {
      currentSection = 'summary';
      summary = line.replace(/^要約[:：]\s*/, '').trim();
    } else if (line.startsWith('詳細要約:') || line.startsWith('詳細要約：')) {
      currentSection = 'detailed';
      const content = line.replace(/^詳細要約[:：]\s*/, '').trim();
      if (content) detailedLines.push(content);
    } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
      currentSection = 'tags';
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
    } else if (line.trim()) {
      if (currentSection === 'summary' && !summary) {
        summary = line.trim();
      } else if (currentSection === 'detailed') {
        detailedLines.push(line.trim());
      }
    }
  }
  
  detailedSummary = detailedLines.join('\n');
  
  return { summary, detailedSummary, tags };
}

// モデル情報を取得
async function getModels() {
  try {
    const modelsUrl = USE_PORT_FORWARD 
      ? 'http://localhost:1234/v1/models'
      : `http://${WINDOWS_HOST}:1234/v1/models`;
    const response = await fetch(modelsUrl);
    const data = await response.json() as any;
    return data;
  } catch (error) {
    console.error('Error getting models:', error);
    return null;
  }
}

// メイン実行関数
async function main() {
  console.error('🚀 ローカルLLM動作検証を開始します...\n');
  
  // 1. モデル情報の確認
  console.error('📋 利用可能なモデルを確認中...');
  const models = await getModels();
  if (models) {
    console.error('✅ 利用可能なモデル:');
    models.data.forEach((model: any) => {
      console.error(`   - ${model.id}`);
    });
  } else {
    console.error('⚠️  モデル情報を取得できませんでした');
  }
  console.error('');
  
  // 2. 要約生成テスト
  console.error('📝 要約生成をテスト中...');
  console.error(`テスト記事: "${TEST_ARTICLE.title}"\n`);
  
  try {
    const prompt = createSummaryPrompt(TEST_ARTICLE.title, TEST_ARTICLE.content);
    const startTime = Date.now();
    
    const response = await callLocalLLM(prompt);
    const elapsed = Date.now() - startTime;
    
    console.error('✅ LLMからの応答を受信しました');
    console.error(`⏱️  処理時間: ${elapsed}ms\n`);
    
    console.error('--- 生のレスポンス ---');
    console.error(response);
    console.error('--- 生のレスポンス終了 ---\n');
    
    // レスポンスをパース
    const result = parseSummaryAndTags(response);
    
    console.error('📊 パース結果:');
    console.error('要約:', result.summary);
    console.error('\n詳細要約:', result.detailedSummary);
    console.error('\nタグ:', result.tags.join(', '));
    
    // 結果の検証
    console.error('\n✨ 検証結果:');
    console.error(`- 要約の文字数: ${result.summary.length}文字`);
    console.error(`- 詳細要約の文字数: ${result.detailedSummary.length}文字`);
    console.error(`- タグ数: ${result.tags.length}個`);
    
    if (result.summary.length > 0 && result.tags.length > 0) {
      console.error('\n✅ ローカルLLMは正常に動作しています！');
    } else {
      console.error('\n⚠️  一部の項目が正しく生成されませんでした');
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    console.error('\n💡 確認事項:');
    console.error('1. LM Studioが起動しているか');
    console.error('2. モデルが読み込まれているか');
    console.error(`3. APIサーバーが有効になっているか（${USE_PORT_FORWARD ? 'http://localhost:1234' : `http://${WINDOWS_HOST}:1234`}）`);
    console.error('\n💡 socatを使用する場合:');
    console.error(`   別のターミナルで実行: socat TCP-LISTEN:1234,fork TCP:${WINDOWS_HOST}:1234`);
  }
}

// 実行
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}