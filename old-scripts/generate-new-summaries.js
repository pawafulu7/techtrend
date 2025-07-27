// 要約がない記事の要約を生成するスクリプト
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const prisma = new PrismaClient();

// Gemini設定
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function createSummaryPrompt(title, content) {
  const truncatedContent = content.substring(0, 2000);
  
  return `以下の技術記事の内容を日本語で100-150文字程度に要約してください。

要求事項：
- 必ず日本語で出力すること（英語の記事でも日本語に翻訳して要約）
- 記事の主要な技術的ポイントを含める
- 具体的な技術名、ツール名、手法を含める
- 読者が記事の価値を理解できる内容にする

重要な注意事項：
- 筆者の自己紹介、挨拶、経歴、所属などは一切含めない
- 「初めまして」「〜と申します」「〜で働いています」などの自己紹介文は無視する
- 記事の技術的内容のみに焦点を当てる
- コードの実装内容、解決した問題、使用した技術スタックを優先する

タイトル: ${title}

内容:
${truncatedContent}

日本語要約:`;
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
      .replace(/\n+/g, ' ')
      .substring(0, 200);
    
    return summary;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

async function generateMissingSummaries() {
  try {
    console.log('=== 要約生成開始 ===\n');

    // 要約がない記事を取得
    const articlesWithoutSummary = await prisma.article.findMany({
      where: {
        OR: [
          { summary: '' },
          { summary: null }
        ]
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });

    console.log(`要約が必要な記事: ${articlesWithoutSummary.length}件\n`);

    if (articlesWithoutSummary.length === 0) {
      console.log('すべての記事に要約があります。');
      return;
    }

    // ソース別に集計
    const bySource = {};
    articlesWithoutSummary.forEach(article => {
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
    let totalGenerated = 0;

    for (const [sourceName, articles] of Object.entries(bySource)) {
      console.log(`\n【${sourceName}】の要約を生成中...`);
      
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        
        const promises = batch.map(async (article, index) => {
          try {
            console.log(`  記事 ${i + index + 1}/${articles.length}: ${article.title.substring(0, 50)}...`);
            
            const summary = await generateSummary(article.title, article.content || '');
            
            if (summary) {
              await prisma.article.update({
                where: { id: article.id },
                data: { summary }
              });
              console.log(`    ✓ 要約生成成功`);
              return true;
            } else {
              console.log(`    ✗ 要約生成失敗`);
              return false;
            }
          } catch (error) {
            console.error(`    ✗ エラー: ${error.message}`);
            return false;
          }
        });

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r).length;
        totalGenerated += successCount;

        // API制限対策で待機
        if (i + batchSize < articles.length) {
          console.log(`  待機中...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    console.log(`\n=== 要約生成完了 ===`);
    console.log(`生成成功: ${totalGenerated}件`);
    console.log(`生成失敗: ${articlesWithoutSummary.length - totalGenerated}件`);

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateMissingSummaries();