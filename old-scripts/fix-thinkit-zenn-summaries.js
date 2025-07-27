const { PrismaClient } = require('@prisma/client');

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

async function fixThinkITZennSummaries() {
  const sources = await prisma.source.findMany({
    where: {
      OR: [
        { name: 'Think IT' },
        { name: 'Zenn' }
      ]
    }
  });

  const articlesToFix = [];

  for (const source of sources) {
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        summary: { not: null }
      }
    });

    // 途切れている要約を検出（。で終わらない、または200文字で切れている）
    const truncatedArticles = articles.filter(article => {
      const summary = article.summary || '';
      return !summary.endsWith('。') || summary.length === 200;
    });

    console.log(`${source.name}: ${truncatedArticles.length}件の途切れた要約を検出`);
    articlesToFix.push(...truncatedArticles.map(a => ({ ...a, sourceName: source.name })));
  }

  console.log(`\n合計修正対象: ${articlesToFix.length}件`);

  // バッチ処理で要約を生成
  const batchSize = 5;
  for (let i = 0; i < articlesToFix.length; i += batchSize) {
    const batch = articlesToFix.slice(i, i + batchSize);
    console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, articlesToFix.length)}件目`);

    await Promise.all(
      batch.map(async (article) => {
        try {
          const content = article.content || article.description || '';
          const summary = await generateSummary(article.title, content);
          
          await prisma.article.update({
            where: { id: article.id },
            data: { summary }
          });
          
          console.log(`✓ [${article.sourceName}] ${article.title.substring(0, 40)}...`);
          console.log(`  要約: ${summary}`);
        } catch (error) {
          console.error(`✗ [${article.sourceName}] ${article.title.substring(0, 40)}...`);
          console.error(`  エラー: ${error.message}`);
        }
      })
    );

    // API レート制限対策
    if (i + batchSize < articlesToFix.length) {
      await sleep(2000);
    }
  }

  console.log('\n完了しました！');
}

fixThinkITZennSummaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());