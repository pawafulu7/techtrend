import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function debug() {
  const article = await prisma.article.findUnique({
    where: { id: 'cme47e32v0001tehsc9bavuu5' }
  });
  
  if (!article) {
    console.error('Article not found');
    return;
  }
  
  console.error('=== Article Info ===');
  console.error('Title:', article.title);
  console.error('Content length:', article.content?.length || 0);
  console.error('Summary:', article.summary);
  console.error('Content preview:', article.content?.substring(0, 200));
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No API key');
    return;
  }
  
  const content = article.content || article.summary || article.title;
  const prompt = generateUnifiedPrompt(article.title, content);
  
  console.error('\n=== Prompt ===');
  console.error(prompt.substring(0, 500) + '...');
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.3, 
          maxOutputTokens: 2500,
          topP: 0.8,
          topK: 40
        }
      })
    }
  );

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  console.error('\n=== Gemini Response ===');
  console.error(responseText);
  
  // Parse response
  const lines = responseText.split('\n');
  let summary = '';
  const detailedSummary = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('一覧要約:') || trimmed.startsWith('要約:')) {
      summary = trimmed.replace(/^(一覧)?要約:/, '').trim();
      console.error('\n=== Parsed Summary ===');
      console.error('Found:', summary);
    }
  }
  
  if (!summary) {
    console.error('\n=== No summary found! ===');
  }
  
  await prisma.$disconnect();
}

debug().catch(console.error);