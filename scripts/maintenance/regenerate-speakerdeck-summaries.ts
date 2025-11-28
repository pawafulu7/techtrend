#!/usr/bin/env npx tsx
/**
 * Speaker Deck記事の要約再生成スクリプト
 * 薄いコンテンツ用の新しいプロンプトで要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../lib/utils/article-type-prompts';
import { analyzeContent } from '../lib/utils/content-analyzer';
import { checkSummaryQuality } from '../lib/utils/summary-quality-checker';

const prisma = new PrismaClient();

// コマンドライン引数の処理
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.includes('--limit') ? 
  parseInt(args[args.indexOf('--limit') + 1]) : undefined;
const skipBackup = args.includes('--skip-backup');

interface RegenerationResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gemini APIを使用して要約を生成
 */
async function generateSummaryWithGemini(
  title: string,
  content: string,
  sourceName: string
): Promise<{ summary: string; detailedSummary: string; tags: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 薄いコンテンツ用のプロンプトを生成
  const prompt = generateUnifiedPrompt(title, content, sourceName);
  
  // コンテンツ分析
  const analysis = analyzeContent(content, sourceName);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1, // 薄いコンテンツは創造性を最小に
        maxOutputTokens: 500,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  // 簡易パース（実際のパーサーをインポートできない場合）
  const lines = responseText.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  
  let currentSection = '';
  for (const line of lines) {
    if (line.includes('要約:') || line.includes('要約：')) {
      currentSection = 'summary';
      summary = line.replace(/要約[:：]\s*/, '').trim();
    } else if (line.includes('詳細要約:') || line.includes('詳細要約：')) {
      currentSection = 'detailed';
      detailedSummary = line.replace(/詳細要約[:：]\s*/, '').trim();
    } else if (line.includes('タグ:') || line.includes('タグ：')) {
      currentSection = 'tags';
      const tagLine = line.replace(/タグ[:：]\s*/, '').trim();
      tags = tagLine.split(/[,、，]/).map(t => t.trim()).filter(t => t.length > 0);
    } else if (line.trim() && currentSection === 'summary' && !summary) {
      summary = line.trim();
    } else if (line.trim() && currentSection === 'detailed' && !detailedSummary) {
      detailedSummary = line.trim();
    }
  }

  // フォールバック
  if (!summary) {
    summary = responseText.substring(0, 100);
  }
  if (!detailedSummary) {
    detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
  }

  return { summary, detailedSummary, tags };
}

/**
 * バックアップを作成
 */
async function createBackup(): Promise<void> {
  console.error('📦 バックアップを作成中...');
  
  const articles = await prisma.article.findMany({
    where: {
      source: {
        name: 'Speaker Deck'
      }
    },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      summaryVersion: true
    }
  });

  const backupData = {
    timestamp: new Date().toISOString(),
    count: articles.length,
    articles: articles
  };

  const fs = require('fs');
  const backupPath = `backups/speakerdeck_summaries_${Date.now()}.json`;
  
  // backupsディレクトリが存在しない場合は作成
  if (!fs.existsSync('backups')) {
    fs.mkdirSync('backups');
  }
  
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.error(`✅ バックアップ完了: ${backupPath}`);
}

/**
 * メイン処理
 */
async function regenerateSpeakerDeckSummaries(): Promise<RegenerationResult> {
  console.error('🚀 Speaker Deck記事の要約再生成を開始します');
  console.error(`   モード: ${isDryRun ? 'ドライラン' : '実行'}`);
  if (limit) console.error(`   処理数制限: ${limit}件`);
  
  const result: RegenerationResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // バックアップ作成
    if (!isDryRun && !skipBackup) {
      await createBackup();
    }

    // Speaker Deck記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Speaker Deck'
        }
      },
      include: {
        source: true
      },
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.error(`\n📊 処理対象: ${articles.length}件の記事\n`);

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;
      
      try {
        const content = article.content || '';
        const currentSummaryLength = article.summary?.length || 0;
        
        console.error(`${progress} 処理中: ${article.title.substring(0, 50)}...`);
        console.error(`   現在の要約: ${currentSummaryLength}文字`);
        console.error(`   コンテンツ: ${content.length}文字`);
        
        // コンテンツ分析
        const analysis = analyzeContent(content, 'Speaker Deck');
        console.error(`   判定: 薄いコンテンツ（推奨: ${analysis.recommendedMinLength}-${analysis.recommendedMaxLength}文字）`);
        
        if (isDryRun) {
          console.error('   ⏭️  ドライラン: スキップ\n');
          result.skipped++;
          continue;
        }

        // 要約生成
        const { summary, detailedSummary, tags } = await generateSummaryWithGemini(
          article.title,
          content,
          'Speaker Deck'
        );

        // 品質チェック
        const qualityCheck = checkSummaryQuality(summary, detailedSummary, analysis);
        
        if (!qualityCheck.isValid) {
          console.error(`   ⚠️  品質チェック失敗: スコア ${qualityCheck.score}`);
          qualityCheck.issues.forEach(issue => {
            console.error(`      - ${issue.message}`);
          });
        }

        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary,
            detailedSummary,
            summaryVersion: 7, // 薄いコンテンツ対応版
            updatedAt: new Date()
          }
        });

        console.error(`   ✅ 更新完了: ${summary.length}文字（削減: ${currentSummaryLength - summary.length}文字）`);
        console.error(`   新要約: ${summary.substring(0, 100)}...`);
        console.error('');
        
        result.success++;

        // API Rate Limit対策
        await sleep(2000);
        
        // 10件ごとに長めの待機
        if ((i + 1) % 10 === 0) {
          console.error('⏸️  Rate Limit対策: 10秒待機...\n');
          await sleep(10000);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ エラー: ${errorMessage}\n`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMessage}`);
        
        // エラー時は長めに待機
        await sleep(5000);
      }
    }

    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 再生成完了');
    console.error('='.repeat(60));
    console.error(`✅ 成功: ${result.success}件`);
    console.error(`❌ 失敗: ${result.failed}件`);
    console.error(`⏭️  スキップ: ${result.skipped}件`);
    
    if (result.errors.length > 0) {
      console.error('\n❌ エラー詳細:');
      result.errors.forEach(err => console.error(`   - ${err}`));
    }

    // 統計情報を再計算
    if (!isDryRun && result.success > 0) {
      const stats = await prisma.article.aggregate({
        where: {
          source: {
            name: 'Speaker Deck'
          }
        },
        _avg: {
          qualityScore: true
        },
        _count: {
          id: true
        }
      });

      const summaryStats = await prisma.$queryRaw`
        SELECT 
          AVG(LENGTH(summary)) as avg_summary_length,
          AVG(LENGTH(content)) as avg_content_length,
          COUNT(CASE WHEN LENGTH(summary) > LENGTH(content) AND LENGTH(content) > 0 THEN 1 END) as summary_longer_than_content
        FROM Article a
        JOIN Source s ON a.sourceId = s.id
        WHERE s.name = 'Speaker Deck'
      ` as any[];

      console.error('\n📈 更新後の統計:');
      console.error(`   平均要約長: ${Math.round(summaryStats[0].avg_summary_length)}文字`);
      console.error(`   平均コンテンツ長: ${Math.round(summaryStats[0].avg_content_length)}文字`);
      console.error(`   要約がコンテンツより長い: ${summaryStats[0].summary_longer_than_content}件`);
    }

    return result;

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  regenerateSpeakerDeckSummaries()
    .then(result => {
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}