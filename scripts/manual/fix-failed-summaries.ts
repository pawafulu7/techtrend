#!/usr/bin/env tsx
/**
 * 要約生成に失敗した記事を修正するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary/summary-quality-checker';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface SummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

async function generateUnifiedSummary(title: string, content: string): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  let processedContent = content;
  if (content.length < 300) {
    processedContent = `タイトル: ${title}\n\n内容:\n${content}\n\n注意: この記事は短いため、タイトルと利用可能な情報から推測して要約を作成してください。`;
  } else if (content.length > 5000) {
    processedContent = content.substring(0, 5000);
  }

  const prompt = generateUnifiedPrompt(title, processedContent);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500,  // 詳細要約に対応した統一設定
        topP: 0.8,
        topK: 40
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseResponse(responseText);
}

function parseResponse(text: string): SummaryResult {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSection = false;
  let isSummarySection = false;
  let isTagSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    if (trimmed.startsWith('一覧要約:') || trimmed.startsWith('要約:')) {
      isSummarySection = true;
      isDetailedSection = false;
      isTagSection = false;
      
      const content = trimmed.replace(/^(一覧)?要約:/, '').trim();
      if (content) {
        summary = content;
        isSummarySection = false;
      }
    } else if (trimmed.startsWith('詳細要約:')) {
      isDetailedSection = true;
      isSummarySection = false;
      isTagSection = false;
    } else if (trimmed.startsWith('タグ:')) {
      isTagSection = true;
      isDetailedSection = false;
      isSummarySection = false;
      const tagLine = trimmed.replace('タグ:', '').trim();
      if (tagLine) {
        tags = tagLine.split(',').map(t => t.trim()).filter(t => t.length > 0);
        isTagSection = false;
      }
    } else if (isSummarySection && trimmed && !trimmed.startsWith('【')) {
      summary = trimmed;
      isSummarySection = false;
    } else if (isDetailedSection && trimmed.startsWith('・')) {
      detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
    } else if (isTagSection && trimmed) {
      tags = trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0);
      isTagSection = false;
    }
  }

  if (!summary) {
    summary = 'この記事の要約を生成できませんでした。コンテンツを確認してください。';
  }
  if (!detailedSummary) {
    detailedSummary = `・この記事の主要なトピックは、内容の確認が必要です
・技術的な背景として、詳細情報が不足しています
・具体的な実装や手法について、原文を参照してください
・実践する際のポイントは、手動での確認を推奨します
・今後の展望や応用として、追加の調査が必要です`;
  }

  return { summary, detailedSummary, tags };
}

async function main() {
  console.error('🔧 要約生成に失敗した記事を修正します\n');

  try {
    // 失敗記事を取得
    const failedArticles = await prisma.article.findMany({
      where: {
        summary: 'この記事の要約を生成できませんでした。コンテンツを確認してください。'
      },
      include: { source: true }
    });

    console.error(`📊 対象記事: ${failedArticles.length}件\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < failedArticles.length; i++) {
      const article = failedArticles[i];
      console.error(`[${i + 1}/${failedArticles.length}] ${article.title.substring(0, 50)}...`);
      console.error(`  ソース: ${article.source.name}`);

      try {
        const content = article.content || article.summary || article.title;
        
        if (content.length < 100) {
          console.error(`  ⚠️  極短コンテンツ: ${content.length}文字`);
        }

        const result = await generateUnifiedSummary(article.title, content);
        
        if (result.summary !== 'この記事の要約を生成できませんでした。コンテンツを確認してください。') {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              articleType: 'unified',
              summaryVersion: 5
            }
          });

          console.error(`  ✅ 修正成功`);
          successCount++;
        } else {
          console.error(`  ❌ 修正失敗（要約生成できず）`);
          failCount++;
        }

        // API制限対策（5秒待機）
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
        failCount++;
        
        // Rate Limitエラーの場合は待機
        if (String(error).includes('429') || String(error).includes('rate')) {
          console.error('⏸️  60秒待機...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }

    console.error('\n================================================================================');
    console.error('📊 最終結果');
    console.error(`  成功: ${successCount}件`);
    console.error(`  失敗: ${failCount}件`);
    console.error('================================================================================');

  } catch (error) {
    console.error('❌ 致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);