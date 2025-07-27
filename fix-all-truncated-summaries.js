// すべての途切れた要約を修正するスクリプト
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
- 60-80文字以内で完結した文章
- 技術名・ツール名を含める
- 主要ポイントのみ記載
- 必ず文末は「。」で終わる
- 文章を途中で切らない

禁止事項：
- 「本記事は」「本稿では」「記事では」等の前置き不要
- 自己紹介は除外
- 冗長な表現禁止
- 文章を途中で切ることは絶対禁止

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
    
    // 句点で終わっていない場合は追加
    if (!summary.endsWith('。')) {
      summary += '。';
    }
    
    return summary;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

async function fixAllTruncatedSummaries() {
  try {
    console.log('=== すべての途切れた要約の修正開始 ===\n');

    // 句点で終わっていない要約を持つ記事を取得
    const truncatedArticles = await prisma.article.findMany({
      where: {
        AND: [
          { summary: { not: '' } },
          { summary: { not: null } },
          { NOT: { summary: { endsWith: '。' } } }
        ]
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });

    console.log(`修正が必要な記事: ${truncatedArticles.length}件\n`);

    if (truncatedArticles.length === 0) {
      console.log('修正が必要な記事はありません。');
      return;
    }

    // バッチサイズを5に設定
    const batchSize = 5;
    let totalFixed = 0;

    // 最大50件まで処理
    const articlesToProcess = truncatedArticles.slice(0, 50);

    for (let i = 0; i < articlesToProcess.length; i += batchSize) {
      const batch = articlesToProcess.slice(i, i + batchSize);
      
      const promises = batch.map(async (article, index) => {
        try {
          console.log(`記事 ${i + index + 1}/${articlesToProcess.length}: ${article.title.substring(0, 40)}...`);
          console.log(`  現在の要約(${article.summary.length}文字): ${article.summary}`);
          
          const newSummary = await generateSummary(article.title, article.content || '');
          
          if (newSummary && newSummary.endsWith('。')) {
            await prisma.article.update({
              where: { id: article.id },
              data: { summary: newSummary }
            });
            console.log(`  ✓ 修正成功(${newSummary.length}文字): ${newSummary}`);
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
      if (i + batchSize < articlesToProcess.length) {
        console.log('  待機中...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n=== 修正完了 ===`);
    console.log(`修正成功: ${totalFixed}件`);
    console.log(`修正失敗: ${articlesToProcess.length - totalFixed}件`);
    
    if (truncatedArticles.length > 50) {
      console.log(`\n注意: さらに${truncatedArticles.length - 50}件の記事が修正を必要としています。`);
      console.log('スクリプトを再度実行してください。');
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllTruncatedSummaries();