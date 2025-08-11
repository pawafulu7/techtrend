#!/usr/bin/env tsx
/**
 * 全記事の要約を強制的に再生成するスクリプト
 * 品質に関わらず、全ての記事を対象に新しい要約を生成します
 */

import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

// コマンドライン引数
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : 20;

interface SummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

async function generateImprovedSummary(title: string, content: string): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  // コンテンツを適切な長さに調整
  let processedContent = content;
  if (content.length < 300) {
    // コンテンツが短い場合はタイトルを含めて文脈を補強
    processedContent = `タイトル: ${title}\n\n内容:\n${content}\n\n注意: この記事は短いため、タイトルと利用可能な情報から推測して要約を作成してください。`;
  } else if (content.length > 5000) {
    // 長すぎる場合は切り詰め
    processedContent = content.substring(0, 5000);
  }

  const enhancedPrompt = `
以下の技術記事を日本語で要約してください。

【記事情報】
タイトル: ${title}
内容: ${processedContent}

【重要な要約作成ルール】
1. 一覧要約（必須）:
   - 150-180文字で記事の要点を簡潔にまとめる
   - 技術的な具体性を持たせる
   - 必ず「。」で終わる
   - 一般的な表現を避け、具体的な技術名や手法を含める

2. 詳細要約（必須）:
   - 必ず5つの箇条書きを作成
   - 各項目は「・」で始まる
   - 各項目は100-120文字
   - 句点（。）なしで終わる
   - 技術的な詳細や具体的な実装方法を含める

3. タグ（必須）:
   - 関連する技術タグを3-5個
   - カンマ区切りで記載

【出力形式】
一覧要約: [150-180文字の要約]
詳細要約:
・[100-120文字の項目1]
・[100-120文字の項目2]
・[100-120文字の項目3]
・[100-120文字の項目4]
・[100-120文字の項目5]
タグ: [タグ1, タグ2, タグ3]

コンテンツが短い場合でも、タイトルと利用可能な情報から推測して、必ず上記の形式を満たす要約を生成してください。
`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: enhancedPrompt }]
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2500,
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

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('一覧要約:')) {
      summary = trimmed.replace('一覧要約:', '').trim();
    } else if (trimmed.startsWith('詳細要約:')) {
      isDetailedSection = true;
    } else if (trimmed.startsWith('タグ:')) {
      isDetailedSection = false;
      const tagLine = trimmed.replace('タグ:', '').trim();
      tags = tagLine.split(',').map(t => t.trim()).filter(t => t.length > 0);
    } else if (isDetailedSection && trimmed.startsWith('・')) {
      detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
    }
  }

  // 最低限のフォールバック
  if (!summary) {
    summary = 'この記事の要約を生成できませんでした。コンテンツを確認してください。';
  }
  if (!detailedSummary) {
    detailedSummary = '・詳細な要約情報が不足しています\n・記事の内容を確認してください\n・手動での要約作成を推奨します\n・技術的な詳細は原文を参照してください\n・この要約は自動生成の失敗例です';
  }

  return { summary, detailedSummary, tags };
}

async function main() {
  console.log('🔄 全記事の要約を強制再生成します');
  console.log(`処理上限: ${limit}件\n`);

  try {
    // 全記事を取得（最新順）
    const articles = await prisma.article.findMany({
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: limit
    });

    console.log(`対象記事数: ${articles.length}件\n`);

    let successCount = 0;
    let improvedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.log(`[${i + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
      
      try {
        // 現在の品質をチェック
        const currentQuality = article.summary ? 
          checkSummaryQuality(article.summary, article.detailedSummary || '').score : 0;
        console.log(`  現在の品質スコア: ${currentQuality}点`);

        // コンテンツの準備
        const content = article.content || article.description || article.title;
        console.log(`  コンテンツ長: ${content.length}文字`);

        // 新しい要約を生成
        const result = await generateImprovedSummary(article.title, content);
        
        // 新しい品質をチェック
        const newQuality = checkSummaryQuality(result.summary, result.detailedSummary).score;
        console.log(`  新しい品質スコア: ${newQuality}点`);

        if (newQuality > currentQuality) {
          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              articleType: 'unified',
              summaryVersion: 5
            }
          });

          // タグの更新
          if (result.tags.length > 0) {
            for (const tagName of result.tags) {
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName }
              });
              
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  tags: { connect: { id: tag.id } }
                }
              });
            }
          }

          console.log(`  ✅ 改善成功: ${currentQuality} → ${newQuality}点`);
          improvedCount++;
        } else {
          console.log(`  ⏭️  改善なし（現状維持）`);
        }
        successCount++;

        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        failedCount++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // 結果サマリー
    console.log('\n' + '='.repeat(60));
    console.log('📊 処理結果');
    console.log('='.repeat(60));
    console.log(`処理成功: ${successCount}件`);
    console.log(`品質改善: ${improvedCount}件`);
    console.log(`処理失敗: ${failedCount}件`);

    if (improvedCount > 0) {
      console.log('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.log('✅ キャッシュ無効化完了');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);