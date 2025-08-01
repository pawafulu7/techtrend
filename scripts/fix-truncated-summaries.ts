import { PrismaClient, Article } from '@prisma/client';
import fetch from 'node-fetch';
import { normalizeTag } from '@/lib/utils/tag-normalizer';

const prisma = new PrismaClient();

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

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
記事が解決する問題を100-120文字で要約。「〜の問題を〜により解決」の形式で、技術名と効果を含め句点で終了。文字数厳守。

詳細要約:
以下の要素を技術的に詳しく箇条書きで記載（各項目は「・」で開始、2-3文で説明）：
・記事の主題と技術的背景（使用技術、前提知識）
・解決しようとしている具体的な問題と現状の課題
・提示されている解決策の技術的アプローチ（アルゴリズム、設計パターン等）
・実装方法の詳細（具体的なコード例、設定方法、手順）
・期待される効果と性能改善の指標（数値があれば含める）
・実装時の注意点、制約事項、必要な環境

タグ:
技術名,フレームワーク名,カテゴリ名,概念名

【タグの例】
JavaScript, React, フロントエンド, 状態管理`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200, // 詳細要約が途切れないよう増加
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

function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

function finalCleanup(text: string): string {
  if (!text) return text;
  
  // 冒頭の重複ラベル除去
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,  // プロンプト指示の除去
    /^【?簡潔にまとめ.*?】?\s*/
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  // 先頭の句読点を除去
  text = text.replace(/^[、。]\s*/, '');
  
  // 改行の正規化
  text = text.replace(/\n+/g, '\n').trim();
  
  // 文末に句点がない場合は追加（箇条書きの場合は除く）
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
  
  // パターン定義
  const summaryPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/
  ];
  
  const detailedSummaryPatterns = [
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/
  ];
  
  const promptPatterns = [
    /^\d+-\d+文字の日本語で/,
    /^簡潔にまとめ/,
    /^以下の観点で/,
    /^記事が解決する問題/,
    /^以下の要素を箇条書き/
  ];

  let summaryStarted = false;
  let detailedSummaryStarted = false;

  for (const line of lines) {
    // プロンプト指示行をスキップ
    if (promptPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    
    // summary処理
    if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
      summary = line;
      summaryPatterns.forEach(pattern => {
        summary = summary.replace(pattern, '');
      });
      summary = cleanupText(summary);
      summaryStarted = true;
      isDetailedSummary = false;
    }
    // summaryの続きの行（空行が来るまで）
    else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      summary += '\n' + cleanupText(line);
    }
    // detailedSummary処理
    else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
      detailedSummary = line;
      detailedSummaryPatterns.forEach(pattern => {
        detailedSummary = detailedSummary.replace(pattern, '');
      });
      detailedSummary = cleanupText(detailedSummary);
      detailedSummaryStarted = true;
      isDetailedSummary = true;
    }
    // detailedSummaryの続きの行
    else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      // 箇条書きの場合はそのまま追加（cleanupTextを適用しない）
      if (line.trim().startsWith('・')) {
        detailedSummary += '\n' + line.trim();
      } else {
        detailedSummary += '\n' + cleanupText(line);
      }
    }
    // タグ処理
    else if (line.match(/^タグ[:：]/)) {
      isDetailedSummary = false;
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
    }
    // 空行でセクション終了
    else if (!line.trim()) {
      if (summaryStarted && !detailedSummaryStarted) {
        summaryStarted = false;
      }
    }
  }
  
  // 最終クリーンアップ
  summary = finalCleanup(summary);
  detailedSummary = finalCleanup(detailedSummary);
  
  // フォールバック
  if (!summary) {
    summary = text.substring(0, 150);
  }
  if (!detailedSummary) {
    detailedSummary = text.substring(0, 300);
  }

  return { summary, detailedSummary, tags };
}

async function fixTruncatedSummaries() {
  console.log('📝 途切れた要約を修正します...');
  
  try {
    // 途切れた要約を持つ記事を取得
    const allArticlesWithSummary = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: { source: true }
    });

    const truncatedArticles = allArticlesWithSummary.filter(article => {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      // 「。」で終わらない、または200文字で切れている要約
      const summaryTruncated = !summary.endsWith('。') || summary.length === 200 || summary.length === 203;
      // 詳細要約が途切れている（句点で終わらない）
      const detailedTruncated = detailedSummary.length > 0 && 
        !detailedSummary.match(/[。！？]$/);
      return summaryTruncated || detailedTruncated;
    });

    console.log(`\n📄 処理対象の記事数: ${truncatedArticles.length}件\n`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const article of truncatedArticles) {
      try {
        console.log(`\n処理中: ${article.title.substring(0, 50)}...`);
        console.log(`  Source: ${article.source.name}`);
        
        const content = article.content || article.title;
        const result = await generateSummaryAndTags(article.title, content);
        
        // 要約を更新
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            summary: result.summary,
            detailedSummary: result.detailedSummary
          }
        });
        
        console.log(`  ✓ 修正完了`);
        console.log(`    新しい要約: ${result.summary.substring(0, 100)}...`);
        console.log(`    詳細要約文字数: ${result.detailedSummary.length}文字`);
        
        fixedCount++;
        
        // API レート制限対策
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error(`  ✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }
    }

    console.log(`\n📊 修正完了:`);
    console.log(`   成功: ${fixedCount}件`);
    console.log(`   エラー: ${errorCount}件`);

  } catch (error) {
    console.error('❌ エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  fixTruncatedSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { fixTruncatedSummaries };