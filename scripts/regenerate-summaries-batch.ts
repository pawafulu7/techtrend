import { PrismaClient, Article } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

// API統計情報
const apiStats = {
  attempts: 0,
  successes: 0,
  failures: 0,
  overloadErrors: 0,
  startTime: Date.now()
};

// 要約生成関数（generate-summaries.tsから必要な部分を抽出）
async function generateSummaryAndTags(title: string, content: string): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${title}
内容: ${content.substring(0, 4000)}

以下の観点で分析し、指定された形式で回答してください：

【分析観点】
1. 記事の主要なトピックと技術的な焦点
2. 解決しようとしている問題や課題
3. 提示されている解決策やアプローチ
4. 実装の具体例やコードの有無
5. 対象読者のレベル（初級/中級/上級）

【回答形式】
※重要: 各セクションのラベル（要約:、詳細要約:、タグ:）のみ記載し、それ以外の説明や指示文は一切含めないでください。

要約:
記事の核心を120-150文字ちょうどで要約。技術・問題・解決策を含む1-2文にまとめ、必ず句点で終了。文字数制限厳守。

詳細要約:
以下の要素を箇条書きで記載（各項目は「・」で開始）：
・記事の主題と背景
・解決しようとしている具体的な問題
・提示されている解決策やアプローチ
・実装方法や技術的な詳細
・期待される効果やメリット
・注意点や考慮事項

タグ:
技術名,フレームワーク名,カテゴリ名,概念名

【タグの例】
JavaScript, React, フロントエンド, 状態管理`;

  apiStats.attempts++;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseSummaryAndTags(responseText);
}

// parseSummaryAndTags関数（generate-summaries.tsから）
function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

function finalCleanup(text: string): string {
  if (!text) return text;
  
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,
    /^【?簡潔にまとめ.*?】?\s*/
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  text = text.replace(/^[、。]\s*/, '');
  text = text.replace(/\n+/g, '\n').trim();
  
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    text += '。';
  }
  
  return text;
}

function parseSummaryAndTags(text: string): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSummary = false;
  
  const summaryPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
  ];
  
  const detailedSummaryPatterns = [
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/
  ];

  let summaryStarted = false;
  let detailedSummaryStarted = false;

  for (const line of lines) {
    if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
      summary = line;
      summaryPatterns.forEach(pattern => {
        summary = summary.replace(pattern, '');
      });
      summary = cleanupText(summary);
      summaryStarted = true;
      isDetailedSummary = false;
    }
    else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      summary += '\n' + cleanupText(line);
    }
    else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
      detailedSummary = line;
      detailedSummaryPatterns.forEach(pattern => {
        detailedSummary = detailedSummary.replace(pattern, '');
      });
      detailedSummary = cleanupText(detailedSummary);
      detailedSummaryStarted = true;
      isDetailedSummary = true;
    }
    else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      if (line.trim().startsWith('・')) {
        detailedSummary += '\n' + line.trim();
      } else {
        detailedSummary += '\n' + cleanupText(line);
      }
    }
    else if (line.match(/^タグ[:：]/)) {
      isDetailedSummary = false;
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30);
    }
    else if (!line.trim()) {
      if (summaryStarted && !detailedSummaryStarted) {
        summaryStarted = false;
      }
    }
  }
  
  summary = finalCleanup(summary);
  detailedSummary = finalCleanup(detailedSummary);
  
  if (!summary) {
    summary = text.substring(0, 150);
  }
  if (!detailedSummary) {
    detailedSummary = text.substring(0, 300);
  }

  return { summary, detailedSummary, tags };
}

// タグの正規化
function normalizeTag(tag: string): string {
  const tagNormalizationMap: Record<string, string> = {
    'javascript': 'JavaScript',
    'js': 'JavaScript',
    'typescript': 'TypeScript',
    'ts': 'TypeScript',
    'react': 'React',
    'vue': 'Vue.js',
    'angular': 'Angular',
    'nodejs': 'Node.js',
    'node': 'Node.js',
    'python': 'Python',
    'java': 'Java',
    'go': 'Go',
    'golang': 'Go',
    'rust': 'Rust',
    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'aws': 'AWS',
    'gcp': 'Google Cloud',
    'azure': 'Azure',
    'ai': 'AI',
    'ml': '機械学習',
    'llm': 'LLM',
    'api': 'API',
    'restapi': 'REST API',
    'graphql': 'GraphQL',
    'frontend': 'フロントエンド',
    'backend': 'バックエンド',
    'fullstack': 'フルスタック',
    'devops': 'DevOps',
    'cicd': 'CI/CD',
    'database': 'データベース',
    'db': 'データベース',
    'security': 'セキュリティ',
    'test': 'テスト',
    'testing': 'テスト',
    'performance': 'パフォーマンス',
    'optimization': '最適化',
    'oss': 'OSS',
    'opensource': 'OSS'
  };
  
  const lowerTag = tag.toLowerCase();
  return tagNormalizationMap[lowerTag] || tag;
}

// メイン処理
async function regenerateSummaries() {
  const backupDir = path.join(process.cwd(), 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `summaries-backup-${timestamp}.json`);
  
  console.log('=== 既存記事の要約再生成 ===\n');
  console.log(`バックアップファイル: ${backupPath}\n`);
  
  // すべての記事を取得
  const articles = await prisma.article.findMany({
    where: {
      content: { not: null }
    },
    orderBy: { publishedAt: 'desc' }
  });
  
  console.log(`総記事数: ${articles.length}件\n`);
  
  // バックアップ作成
  const backup = articles.map(a => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    detailedSummary: a.detailedSummary
  }));
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
  console.log('バックアップ作成完了\n');
  
  // バッチ処理
  const batchSize = 10;
  const batches = Math.ceil(articles.length / batchSize);
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, articles.length);
    const batch = articles.slice(start, end);
    
    console.log(`\nバッチ ${i + 1}/${batches} (${start + 1}-${end}件目)を処理中...`);
    
    for (const article of batch) {
      if (!article.content) continue;
      
      try {
        console.log(`  [${start + batch.indexOf(article) + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
        
        const result = await generateSummaryAndTags(article.title, article.content);
        
        // タグの処理
        const normalizedTags = result.tags.map(tag => normalizeTag(tag));
        const existingTags = await prisma.tag.findMany({
          where: { name: { in: normalizedTags } }
        });
        
        const existingTagNames = new Set(existingTags.map(t => t.name));
        const newTags = normalizedTags.filter(tag => !existingTagNames.has(tag));
        
        if (newTags.length > 0) {
          await prisma.tag.createMany({
            data: newTags.map(name => ({ name })),
            skipDuplicates: true
          });
        }
        
        const allTags = await prisma.tag.findMany({
          where: { name: { in: normalizedTags } }
        });
        
        // 記事を更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            tags: {
              set: allTags.map(tag => ({ id: tag.id }))
            }
          }
        });
        
        console.log(`    ✅ 要約: ${result.summary.length}文字`);
        successCount++;
        
        // API制限対策（1秒待機）
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`    ❌ エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        errorCount++;
        
        // エラー時はより長く待機
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`  バッチ完了: 成功 ${successCount}件 / エラー ${errorCount}件`);
  }
  
  // 統計情報
  const endTime = Date.now();
  const duration = (endTime - apiStats.startTime) / 1000;
  
  console.log('\n=== 処理完了 ===');
  console.log(`総処理時間: ${duration.toFixed(1)}秒`);
  console.log(`成功: ${successCount}件`);
  console.log(`エラー: ${errorCount}件`);
  console.log(`API呼び出し: ${apiStats.attempts}回`);
  
  await prisma.$disconnect();
}

// 実行
if (require.main === module) {
  regenerateSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}