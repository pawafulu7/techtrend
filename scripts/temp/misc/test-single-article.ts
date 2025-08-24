import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import { normalizeTag } from '@/lib/utils/tag-normalizer';

const prisma = new PrismaClient();

// 修正されたparseSummaryAndTags関数（generate-summaries.tsからコピー）
interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType?: string;
}

function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
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
  let tagSectionStarted = false;
  
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
    if (promptPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    
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
      tagSectionStarted = true;
      
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      if (tagLine.trim()) {
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => normalizeTag(tag));
        tagSectionStarted = false;
      }
    }
    else if (tagSectionStarted && line.trim() && !line.match(/^(要約|詳細要約)[:：]/)) {
      tags = line.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
      tagSectionStarted = false;
    }
    else if (!line.trim()) {
      if (summaryStarted && !detailedSummaryStarted) {
        summaryStarted = false;
      }
      tagSectionStarted = false;
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

async function testSingleArticle() {
  console.error('=== タグなし記事での実際の生成テスト ===\n');
  
  // タグなし記事を1件取得
  const article = await prisma.article.findFirst({
    where: {
      tags: {
        none: {}
      }
    },
    include: {
      source: true
    }
  });
  
  if (!article) {
    console.error('タグなし記事が見つかりません');
    await prisma.$disconnect();
    return;
  }
  
  console.error('テスト対象記事:');
  console.error(`- タイトル: ${article.title}`);
  console.error(`- ソース: ${article.source.name}`);
  console.error(`- URL: ${article.url}`);
  console.error('');
  
  // Gemini APIのモックレスポンス（実際のAPIは呼ばない）
  const mockResponse = `要約:
${article.title}に関する技術記事の要約内容がここに入ります。

詳細要約:
以下の要素を箇条書きで記載：
・技術的な詳細ポイント1
・技術的な詳細ポイント2
・技術的な詳細ポイント3

タグ:
技術記事, プログラミング, Web開発, ${article.source.name}`;
  
  console.error('=== Gemini API モックレスポンス ===');
  console.error(mockResponse);
  console.error('');
  
  // パース実行
  const result = parseSummaryAndTags(mockResponse);
  
  console.error('=== パース結果 ===');
  console.error(`要約: ${result.summary}`);
  console.error(`詳細要約: ${result.detailedSummary}`);
  console.error(`タグ: ${result.tags.join(', ')}`);
  console.error(`タグ数: ${result.tags.length}`);
  
  // 結果検証
  console.error('\n=== 検証結果 ===');
  if (result.tags.length > 0) {
    console.error('✅ タグが正しく抽出されました');
  } else {
    console.error('❌ タグの抽出に失敗しました');
  }
  
  await prisma.$disconnect();
}

testSingleArticle()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });