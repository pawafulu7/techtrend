#!/usr/bin/env -S tsx
import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const prisma = new PrismaClient();

async function testSummaryGeneration() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // テスト対象の記事ID
  const testArticleIds = [
    'cme6tuuif0004teynz8p1s1vx', // Qiita 109,414文字
    'cme6pfcjk001wte359bf452le', // Dev.to 95,737文字
    'cmdtm7c3j005nte4d8gjfeepx'  // Qiita 62,515文字
  ];

  for (const articleId of testArticleIds) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });

    if (!article || !article.content) continue;

    console.error('\n========================================');
    console.error(`テスト記事: ${article.title.substring(0, 50)}...`);
    console.error(`ソース: ${article.source.name}`);
    console.error(`コンテンツ文字数: ${article.content.length}文字`);
    console.error('========================================');

    // 既存の要約を表示
    console.error('\n【既存の要約（4,000文字制限）】');
    console.error(`要約: ${article.summary?.substring(0, 100)}...`);
    const oldSpeculativeCount = (article.summary?.match(/と思われる|かもしれない|と考えられる|おそらく|ようだ|推測される|可能性がある/g) || []).length;
    console.error(`推測表現: ${oldSpeculativeCount}個`);

    // 新しいプロンプトを生成（150,000文字制限）
    const prompt = generateUnifiedPrompt(article.title, article.content);
    console.error(`\nプロンプトに含まれるコンテンツ文字数: ${prompt.includes('[文字数制限により以下省略]') ? '150,000文字（制限適用）' : article.content.length + '文字（全文）'}`);

    // Gemini APIで新しい要約を生成
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      // Timeout wrapper for fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2500,
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as any;
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // 要約部分を抽出
        const summaryMatch = generatedText.match(/要約[:：]\s*(.+?)(?=\n\n|詳細要約|$)/s);
        const newSummary = summaryMatch?.[1]?.trim() || '';
        
        console.error('\n【新しい要約（150,000文字制限）】');
        console.error(`要約: ${newSummary.substring(0, 100)}...`);
        const newSpeculativeCount = (newSummary.match(/と思われる|かもしれない|と考えられる|おそらく|ようだ|推測される|可能性がある/g) || []).length;
        console.error(`推測表現: ${newSpeculativeCount}個`);
        console.error(`文字数: ${newSummary.length}文字`);
        
        console.error('\n【改善効果】');
        console.error(`推測表現の削減: ${oldSpeculativeCount}個 → ${newSpeculativeCount}個`);
        
        // 詳細要約の一部も確認
        const detailMatch = generatedText.match(/詳細要約[:：]\s*(.+?)(?=\n\nタグ|$)/s);
        const detailSummary = detailMatch?.[1]?.trim() || '';
        if (detailSummary) {
          const detailLines = detailSummary.split('\n').filter(line => line.trim());
          console.error(`詳細要約の項目数: ${detailLines.length}項目`);
          console.error(`詳細要約の文字数: ${detailSummary.length}文字`);
        }
      } else {
        let body = '';
        try {
          const ct = response.headers.get('content-type') || '';
          body = ct.includes('application/json')
            ? JSON.stringify(await response.json(), null, 2)
            : await response.text();
        } catch {}
        const snippet = body.slice(0, 1000);
        console.error(`APIエラー: ${response.status} ${response.statusText}`);
        if (snippet) console.error(`レスポンス: ${snippet}${body.length > 1000 ? '…' : ''}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('APIタイムアウト: 30秒以内にレスポンスが返されませんでした');
      } else {
        console.error('API呼び出しエラー:', error.message);
      }
    }

    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

testSummaryGeneration()
  .catch((error) => {
    console.error('テストエラー:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });