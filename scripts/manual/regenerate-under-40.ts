#!/usr/bin/env tsx
/**
 * 40点未満の低品質要約を全て再生成するスクリプト
 * コンテンツが貧弱な記事でも可能な限り改善を試みる
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { generateUnifiedPrompt } from '../../lib/utils/article/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary/summary-quality-checker';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = createPrismaClient();

// コマンドライン引数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceAll = args.includes('--force-all'); // 40点以上でも処理

interface SummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

interface ProcessStats {
  totalTargets: number;
  processed: number;
  improved: number;
  unchanged: number;
  failed: number;
  startTime: number;
  scoreImprovements: number[];
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
  console.error('🔄 40点未満の低品質要約を全て再生成します');
  console.error('================================================================================\n');

  const stats: ProcessStats = {
    totalTargets: 0,
    processed: 0,
    improved: 0,
    unchanged: 0,
    failed: 0,
    startTime: Date.now(),
    scoreImprovements: []
  };

  try {
    // 40点未満の記事を取得
    console.error('📊 低品質記事を検索中...');
    const allArticles = await prisma.article.findMany({
      where: { summary: { not: null } },
      include: { source: true },
      orderBy: { publishedAt: 'desc' }
    });

    const targetArticles = [];
    for (const article of allArticles) {
      const score = checkSummaryQuality(article.summary!, article.detailedSummary || '').score;
      if (score < 40 || forceAll) {
        targetArticles.push({ ...article, currentScore: score });
      }
    }

    stats.totalTargets = targetArticles.length;
    console.error(`\n✅ 対象記事: ${stats.totalTargets}件（40点未満）`);
    
    if (isDryRun) {
      console.error('⚠️  DRY-RUNモード: 実際の更新は行いません\n');
    }

    // 処理開始
    console.error('\n処理を開始します...\n');
    console.error('=' .repeat(80));

    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      const currentScore = article.currentScore;
      
      // 進捗表示（10件ごと）
      if (i > 0 && i % 10 === 0) {
        const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
        const rate = Math.round(stats.processed / elapsed * 60);
        const eta = Math.round((stats.totalTargets - stats.processed) / (stats.processed / elapsed));
        
        console.error('\n' + '=' .repeat(80));
        console.error(`📈 進捗: ${stats.processed}/${stats.totalTargets} (${Math.round(stats.processed / stats.totalTargets * 100)}%)`);
        console.error(`⏱️  経過時間: ${elapsed}秒 | 処理速度: ${rate}件/分 | 推定残り時間: ${eta}秒`);
        console.error(`✅ 改善: ${stats.improved}件 | ⏭️  変化なし: ${stats.unchanged}件 | ❌ 失敗: ${stats.failed}件`);
        
        if (stats.scoreImprovements.length > 0) {
          const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
          console.error(`📊 平均改善度: +${avgImprovement}点`);
        }
        console.error('=' .repeat(80) + '\n');
      }
      
      console.error(`[${i + 1}/${stats.totalTargets}] ${article.title.substring(0, 50)}...`);
      console.error(`  現在: ${currentScore}点 | ソース: ${article.source.name}`);
      
      try {
        // コンテンツの準備
        const content = article.content || article.title;
        
        // 短すぎるコンテンツの警告
        if (content.length < 100) {
          console.error(`  ⚠️  極短コンテンツ: ${content.length}文字`);
        }

        // 新しい要約を生成
        const result = await generateImprovedSummary(article.title, content);
        
        // 新しい品質をチェック
        const newScore = checkSummaryQuality(result.summary, result.detailedSummary).score;
        
        if (newScore > currentScore) {
          if (!isDryRun) {
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
          }

          const improvement = newScore - currentScore;
          console.error(`  ✅ 改善: ${currentScore} → ${newScore}点 (+${improvement}点)`);
          stats.improved++;
          stats.scoreImprovements.push(improvement);
        } else {
          console.error(`  ⏭️  変化なし: ${currentScore}点`);
          stats.unchanged++;
        }
        
        stats.processed++;

        // API制限対策（3秒待機）
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        stats.failed++;
        stats.processed++;
        
        // エラー時は5秒待機
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // 最終結果サマリー
    const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    
    console.error('\n' + '=' .repeat(80));
    console.error('📊 最終結果レポート');
    console.error('=' .repeat(80));
    console.error(`\n【処理統計】`);
    console.error(`  対象記事数: ${stats.totalTargets}件`);
    console.error(`  処理完了: ${stats.processed}件`);
    console.error(`  改善成功: ${stats.improved}件 (${Math.round(stats.improved / stats.processed * 100)}%)`);
    console.error(`  変化なし: ${stats.unchanged}件`);
    console.error(`  処理失敗: ${stats.failed}件`);
    
    if (stats.scoreImprovements.length > 0) {
      const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
      const maxImprovement = Math.max(...stats.scoreImprovements);
      
      console.error(`\n【品質改善】`);
      console.error(`  平均改善度: +${avgImprovement}点`);
      console.error(`  最大改善度: +${maxImprovement}点`);
      console.error(`  改善率: ${Math.round(stats.improved / stats.processed * 100)}%`);
    }
    
    console.error(`\n【処理時間】`);
    console.error(`  総処理時間: ${minutes}分${seconds}秒`);
    console.error(`  平均処理時間: ${Math.round(totalTime / stats.processed)}秒/件`);

    // キャッシュ無効化
    if (!isDryRun && stats.improved > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.error('✅ キャッシュ無効化完了');
    }

    console.error('\n✨ 全ての処理が完了しました！');

  } catch (error) {
    console.error('\n❌ 致命的エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(console.error);