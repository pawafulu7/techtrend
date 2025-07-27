// 100文字で切れている要約を修正するスクリプト
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function createSummaryPrompt(title, content) {
  const truncatedContent = content.substring(0, 2000);
  
  return `以下の技術記事を60-80文字で要約してください。

要求事項：
- 必ず日本語で出力
- 60-80文字以内で完結
- 技術名・ツール名を含める
- 主要ポイントのみ記載
- 必ず文章を完結させる（途中で切らない）

禁止事項：
- 「本記事は」「本稿では」「記事では」等の前置き不要
- 自己紹介は除外
- 冗長な表現禁止

タイトル: ${title}

内容:
${truncatedContent}

要約:`;
}

async function generateSummary(title, content) {
  try {
    const prompt = await createSummaryPrompt(title, content);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let summary = response.text();
    
    // 要約をクリーンアップ
    summary = summary
      .trim()
      .replace(/^(要約|日本語要約)[:：]\s*/i, '')
      .replace(/^(本記事は|本稿では|記事では|この記事は)/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    
    return summary;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

async function fixTruncatedSummaries() {
  try {
    console.log('=== 途切れた要約の修正開始 ===\n');

    // 100文字ちょうどで切れている要約を持つ記事を取得
    const truncatedArticles = await prisma.article.findMany({
      where: {
        AND: [
          { summary: { not: '' } },
          { summary: { not: null } }
        ]
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });

    // 100文字で切れている記事をフィルタリング
    const articlesToFix = truncatedArticles.filter(article => {
      const len = article.summary.length;
      return len === 100 && !article.summary.endsWith('。');
    });

    console.log(`修正が必要な記事: ${articlesToFix.length}件\n`);

    if (articlesToFix.length === 0) {
      console.log('修正が必要な記事はありません。');
      return;
    }

    // バッチサイズを5に設定
    const batchSize = 5;
    let totalFixed = 0;

    for (let i = 0; i < articlesToFix.length; i += batchSize) {
      const batch = articlesToFix.slice(i, i + batchSize);
      
      const promises = batch.map(async (article, index) => {
        try {
          console.log(`記事 ${i + index + 1}/${articlesToFix.length}: ${article.title.substring(0, 50)}...`);
          console.log(`  現在の要約: ${article.summary}`);
          
          const newSummary = await generateSummary(article.title, article.content || '');
          
          if (newSummary && newSummary.endsWith('。')) {
            await prisma.article.update({
              where: { id: article.id },
              data: { summary: newSummary }
            });
            console.log(`  ✓ 修正成功: ${newSummary}`);
            return true;
          } else {
            console.log(`  ✗ 修正失敗`);
            return false;
          }
        } catch (error) {
          console.error(`  ✗ エラー: ${error.message}`);
          return false;
        }
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r).length;
      totalFixed += successCount;

      // API制限対策で待機
      if (i + batchSize < articlesToFix.length) {
        console.log('  待機中...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n=== 修正完了 ===`);
    console.log(`修正成功: ${totalFixed}件`);
    console.log(`修正失敗: ${articlesToFix.length - totalFixed}件`);

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixTruncatedSummaries();