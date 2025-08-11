import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function generateUnifiedSummary(title: string, content: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (\!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const prompt = generateUnifiedPrompt(title, content.substring(0, 5000));
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2500, topP: 0.8, topK: 40 }
    })
  });

  if (\!response.ok) throw new Error(`API failed: ${response.status}`);
  const data = await response.json() as any;
  const text = data.candidates[0].content.parts[0].text.trim();
  
  const lines = text.split('\n');
  let summary = '', detailedSummary = '', tags: string[] = [];
  let isDetailed = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^(一覧)?要約:/)) summary = trimmed.replace(/^(一覧)?要約:/, '').trim();
    else if (trimmed.startsWith('詳細要約:')) isDetailed = true;
    else if (trimmed.startsWith('タグ:')) {
      isDetailed = false;
      tags = trimmed.replace('タグ:', '').trim().split(',').map(t => t.trim()).filter(t => t);
    }
    else if (isDetailed && trimmed.startsWith('・')) detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
  }
  
  return { summary, detailedSummary, tags };
}

async function main() {
  const id = 'cme47e32v0001tehsc9bavuu5';
  const article = await prisma.article.findUnique({ where: { id }, include: { source: true } });
  if (\!article) throw new Error('Not found');
  
  console.log('📝', article.title);
  console.log('📊 現在:', checkSummaryQuality(article.summary\!, article.detailedSummary || '').score, '点');
  console.log('\n=== 現在の詳細要約 ===\n', article.detailedSummary, '\n');
  
  const result = await generateUnifiedSummary(article.title, article.content || article.summary || article.title);
  const newScore = checkSummaryQuality(result.summary, result.detailedSummary).score;
  
  console.log('\n=== 新しい詳細要約 ===\n', result.detailedSummary, '\n');
  console.log('📊 新スコア:', newScore, '点');
  
  await prisma.article.update({
    where: { id },
    data: { summary: result.summary, detailedSummary: result.detailedSummary, articleType: 'unified', summaryVersion: 5 }
  });
  
  console.log('✅ 完了');
  await prisma.$disconnect();
}

main().catch(console.error);
