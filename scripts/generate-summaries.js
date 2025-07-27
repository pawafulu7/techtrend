const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');

const prisma = new PrismaClient();

async function generateSummary(title, content) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事を60-80文字の日本語で要約してください。著者の自己紹介は除外し、記事の技術的な内容のみを簡潔にまとめてください。文章は必ず「。」で終わるようにしてください。

タイトル: ${title}
内容: ${content.substring(0, 1000)}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 150,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const summary = data.candidates[0].content.parts[0].text.trim();
  
  return summary;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSummaries() {
  console.log('📝 要約生成を開始します...');
  const startTime = Date.now();

  try {
    // 1. 要約がない記事を取得
    const articlesWithoutSummary = await prisma.article.findMany({
      where: { summary: null },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100
    });

    // 2. 英語の要約を持つ記事を取得（Dev.to, Stack Overflow Blog）
    const englishSources = await prisma.source.findMany({
      where: {
        OR: [
          { name: 'Dev.to' },
          { name: 'Stack Overflow Blog' }
        ]
      }
    });

    const articlesWithEnglishSummary = [];
    for (const source of englishSources) {
      const articles = await prisma.article.findMany({
        where: {
          sourceId: source.id,
          summary: { not: null }
        },
        include: { source: true },
        take: 50
      });

      // 日本語を含まない要約を検出
      const englishArticles = articles.filter(article => {
        const summary = article.summary || '';
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary);
        return !hasJapanese;
      });

      articlesWithEnglishSummary.push(...englishArticles);
    }

    // 3. 途切れた要約を持つ記事を取得
    const allArticlesWithSummary = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: { source: true },
      take: 200
    });

    const truncatedArticles = allArticlesWithSummary.filter(article => {
      const summary = article.summary || '';
      // 「。」で終わらない、または200文字で切れている要約
      return !summary.endsWith('。') || summary.length === 200 || summary.length === 203;
    });

    // すべての対象記事を結合
    const allArticlesToProcess = [
      ...articlesWithoutSummary,
      ...articlesWithEnglishSummary,
      ...truncatedArticles
    ];

    // 重複を除去
    const uniqueArticles = Array.from(
      new Map(allArticlesToProcess.map(a => [a.id, a])).values()
    );

    if (uniqueArticles.length === 0) {
      console.log('✅ すべての記事が適切な要約を持っています');
      return { generated: 0 };
    }

    console.log(`📄 処理対象の記事数:`);
    console.log(`   - 要約なし: ${articlesWithoutSummary.length}件`);
    console.log(`   - 英語要約: ${articlesWithEnglishSummary.length}件`);
    console.log(`   - 途切れた要約: ${truncatedArticles.length}件`);
    console.log(`   - 合計（重複除去後）: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;
    const batchSize = 3; // API制限を考慮して並列数を調整

    // バッチ処理で要約を生成
    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
      const batch = uniqueArticles.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, uniqueArticles.length)}件目`);

      await Promise.all(
        batch.map(async (article) => {
          try {
            const content = article.content || article.description || '';
            const summary = await generateSummary(article.title, content);
            
            await prisma.article.update({
              where: { id: article.id },
              data: { summary }
            });
            
            console.log(`✓ [${article.source.name}] ${article.title.substring(0, 40)}...`);
            generatedCount++;
          } catch (error) {
            console.error(`✗ [${article.source.name}] ${article.title.substring(0, 40)}...`);
            console.error(`  エラー: ${error.message}`);
            errorCount++;
          }
        })
      );

      // API レート制限対策
      if (i + batchSize < articlesWithoutSummary.length) {
        await sleep(2000);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 要約生成完了: 成功${generatedCount}件, エラー${errorCount}件 (${duration}秒)`);

    return { generated: generatedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ 要約生成エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  generateSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { generateSummaries };