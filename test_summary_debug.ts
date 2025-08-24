import { parseUnifiedResponse, validateParsedResult } from './lib/ai/unified-summary-parser';

async function test() {
  const title = "Apple Silicon MacでQEMU仮想化を廃止しAVFをデフォルトVMMとした「Docker Desktop for Mac v4.44.0」がリリース";
  const content = "Apple Silicon MacでQEMU仮想化を廃止しApple VirtualizationフレームワークをデフォルトVMMとした「Docker Desktop for Mac v4.44.0」がリリースされています。";
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return;
    }
    
    const prompt = `以下の技術記事の要約を生成してください。

タイトル: ${title}

内容: ${content}

以下のフォーマットで必ず出力してください：

一覧要約:
80-130文字の日本語で記事の主要なポイントを要約

詳細要約:
・記事の主題は、〜
・具体的な問題は、〜
・提示されている解決策は、〜
・実装方法の詳細については、〜
・期待される効果は、〜

タグ:
Docker, Mac, Apple Silicon, 仮想化`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
            topP: 0.8,
            topK: 40
          }
        })
      }
    );
    
    if (!response.ok) {
      return;
    }
    
    const data = await response.json() as any;
    const responseText = data.candidates[0].content.parts[0].text;
    
    
    const parsed = parseUnifiedResponse(responseText);
    
    const isValid = validateParsedResult(parsed);
    
    if (!isValid) {
    }
    
  } catch (error) {
  }
}

