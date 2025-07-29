import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateJapaneseSummary(article: any): Promise<{ summary: string; tags: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const content = article.content || article.summary || article.title;
  const truncatedContent = content.length > 3000 ? content.substring(0, 3000) + '...' : content;

  const prompt = `以下の技術記事の内容を読んで、日本語で要約とタグを生成してください。

【記事情報】
タイトル: ${article.title}
内容: ${truncatedContent}

【要約の指示】
- 100文字以内で簡潔に
- 記事の技術的な要点を中心に
- 「本記事は」「本稿では」などの冗長な表現は使わない
- 必ず日本語で書く

【タグの指示】
- 5個以内
- 具体的な技術概念（例: 非同期処理, 状態管理, CI/CD, マイクロサービス）
- 一般的な技術用語を使用（JavaScript→JavaScript, typescript→TypeScript）
- 必ず日本語またはカタカナ、英語の正式名称で

【出力形式】
要約: （ここに要約を書く）
タグ: タグ1, タグ2, タグ3`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  // レスポンスのパース
  const lines = responseText.split('\n');
  let summary = '';
  let tags: string[] = [];

  for (const line of lines) {
    if (line.startsWith('要約:') || line.startsWith('要約：')) {
      summary = line.replace(/^要約[:：]\s*/, '').trim();
      summary = summary
        .replace(/^(本記事は|本稿では|記事では|この記事は)/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30);
    }
  }

  if (!summary) {
    summary = `${article.title}についての技術記事です。`;
  }

  return { summary, tags };
}

async function fixEnglishSummaries() {
  console.log('🔍 英語の要約を持つ記事を検索中...\n');

  try {
    // 英語の要約を持つ可能性がある記事を取得
    const articlesWithEnglishSummary = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { contains: 'the' } },
          { summary: { contains: 'The' } },
          { summary: { contains: ' is ' } },
          { summary: { contains: ' are ' } },
          { summary: { contains: ' was ' } },
          { summary: { contains: ' were ' } },
          { summary: { contains: ' has ' } },
          { summary: { contains: ' have ' } },
          { summary: { contains: ' will ' } },
          { summary: { contains: ' would ' } },
          { summary: { contains: ' can ' } },
          { summary: { contains: ' could ' } },
          // 日本語の句読点がない
          {
            AND: [
              { summary: { not: { contains: '。' } } },
              { summary: { not: { contains: '、' } } },
              { summary: { not: { contains: 'を' } } },
              { summary: { not: { contains: 'は' } } },
              { summary: { not: { contains: 'が' } } },
              { summary: { not: { contains: 'で' } } },
              { summary: { not: { contains: 'に' } } },
              { summary: { not: { contains: 'の' } } }
            ]
          }
        ]
      },
      include: {
        source: true,
        tags: true
      }
    });

    console.log(`📄 英語の要約を持つ記事数: ${articlesWithEnglishSummary.length}件\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < articlesWithEnglishSummary.length; i++) {
      const article = articlesWithEnglishSummary[i];
      
      try {
        console.log(`処理中: ${i + 1}/${articlesWithEnglishSummary.length}`);
        console.log(`  記事: ${article.title.slice(0, 50)}...`);
        console.log(`  現在の要約: ${article.summary?.slice(0, 50)}...`);

        const { summary, tags } = await generateJapaneseSummary(article);

        // 記事を更新
        await prisma.article.update({
          where: { id: article.id },
          data: { summary }
        });

        // タグを更新
        if (tags.length > 0) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                disconnect: article.tags.map(tag => ({ id: tag.id })),
                connectOrCreate: tags.map(tagName => ({
                  where: { name: tagName },
                  create: { name: tagName }
                }))
              }
            }
          });
        }

        console.log(`  ✓ 新しい要約: ${summary.slice(0, 50)}...`);
        console.log(`  ✓ タグ: ${tags.join(', ')}\n`);
        
        successCount++;

        // API レート制限対策
        await delay(1000);
      } catch (error) {
        console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}\n`);
        errorCount++;
        
        // エラー時は少し長めに待機
        await delay(2000);
      }
    }

    console.log('\n📊 処理完了:');
    console.log(`  成功: ${successCount}件`);
    console.log(`  エラー: ${errorCount}件`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEnglishSummaries().catch(console.error);