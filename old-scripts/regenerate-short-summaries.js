// 既存の長い要約を短い要約に再生成するスクリプト
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const prisma = new PrismaClient();

// Gemini設定
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
      .substring(0, 100);
    
    return summary;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

async function regenerateShortSummaries() {
  try {
    console.log('=== 短い要約の再生成開始 ===\n');

    // 120文字以上の要約を持つ記事を取得
    const articlesWithLongSummary = await prisma.article.findMany({
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

    // 100文字以上の要約を持つ記事をフィルタリング
    const longSummaryArticles = articlesWithLongSummary.filter(
      article => article.summary && article.summary.length > 100
    );

    console.log(`長い要約を持つ記事: ${longSummaryArticles.length}件\n`);

    if (longSummaryArticles.length === 0) {
      console.log('再生成が必要な記事はありません。');
      return;
    }

    // ソース別に集計
    const bySource = {};
    longSummaryArticles.forEach(article => {
      if (!bySource[article.source.name]) {
        bySource[article.source.name] = [];
      }
      bySource[article.source.name].push(article);
    });

    console.log('ソース別の内訳:');
    Object.entries(bySource).forEach(([source, articles]) => {
      console.log(`  ${source}: ${articles.length}件`);
    });
    console.log('');

    // バッチサイズを5に設定
    const batchSize = 5;
    let totalRegenerated = 0;

    for (const [sourceName, articles] of Object.entries(bySource)) {
      console.log(`\n【${sourceName}】の要約を再生成中...`);
      
      // 最新の記事から最大50件まで処理
      const articlesToProcess = articles.slice(0, 50);
      
      for (let i = 0; i < articlesToProcess.length; i += batchSize) {
        const batch = articlesToProcess.slice(i, i + batchSize);
        
        const promises = batch.map(async (article, index) => {
          try {
            const currentLength = article.summary.length;
            console.log(`  記事 ${i + index + 1}/${articlesToProcess.length}: ${article.title.substring(0, 40)}... (現在${currentLength}文字)`);
            
            const newSummary = await generateSummary(article.title, article.content || '');
            
            if (newSummary && newSummary.length <= 100) {
              await prisma.article.update({
                where: { id: article.id },
                data: { summary: newSummary }
              });
              console.log(`    ✓ 再生成成功 (${newSummary.length}文字)`);
              return true;
            } else {
              console.log(`    ✗ 再生成失敗`);
              return false;
            }
          } catch (error) {
            console.error(`    ✗ エラー: ${error.message}`);
            return false;
          }
        });

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r).length;
        totalRegenerated += successCount;

        // API制限対策で待機
        if (i + batchSize < articlesToProcess.length) {
          console.log(`  待機中...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    console.log(`\n=== 要約再生成完了 ===`);
    console.log(`再生成成功: ${totalRegenerated}件`);
    console.log(`再生成失敗: ${longSummaryArticles.length - totalRegenerated}件`);

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateShortSummaries();