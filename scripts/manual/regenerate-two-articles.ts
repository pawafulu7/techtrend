import { createPrismaClient } from '@/lib/prisma/create-client';
import { generateUnifiedPrompt } from '@/lib/utils/article/article-type-prompts';
import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

const prisma = createPrismaClient();

async function regenerateTwoArticles() {
  const articleIds = [
    'cme5mu08l000etecq13hr77jw', // Cybozu MySQL on Kubernetes
    'cme5mtynf0001tecqgfvlk8ru'  // Svelte5でJSライブラリを作成
  ];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  for (const articleId of articleIds) {
    console.error(`\n📝 処理中: ${articleId}`);
    
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      continue;
    }

    console.error(`  タイトル: ${article.title.substring(0, 50)}...`);
    
    const prompt = generateUnifiedPrompt(
      article.title,
      article.content || ''
    );

    console.error('  APIリクエスト送信中...');
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2500,
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`  APIエラー: ${response.status} - ${error}`);
        continue;
      }

      const data = await response.json() as any;
      const responseText = data.candidates[0].content.parts[0].text.trim();
      
      // 統一サービスを使用してパース
      const service = new UnifiedSummaryService();
      const result = service.parseResponse(responseText);
      
      console.error(`  要約文字数: ${result.summary.length}`);
      console.error(`  詳細要約文字数: ${result.detailedSummary.length}`);

      // データベース更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          articleType: 'unified',
          summaryVersion: 5
        }
      });

      // タグの更新
      if (result.tags && result.tags.length > 0) {
        const tagRecords = await Promise.all(
          result.tags.map(async (tagName) => {
            return await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
          })
        );

        await prisma.article.update({
          where: { id: articleId },
          data: {
            tags: {
              set: tagRecords.map(tag => ({ id: tag.id }))
            }
          }
        });
      }

      console.error('  ✅ 更新完了');
      
      // API レート制限対策
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`  エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.error('\n✅ すべての記事の再生成が完了しました');
}

regenerateTwoArticles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());