import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function updateDevToContent() {
  console.log('=== Dev.to記事のコンテンツ更新 ===\n');

  // contentが空のDev.to記事を取得
  const emptyContentArticles = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' },
      OR: [
        { content: null },
        { content: '' }
      ]
    },
    select: {
      id: true,
      title: true,
      url: true
    }
  });

  console.log(`contentが空の記事: ${emptyContentArticles.length}件`);

  if (emptyContentArticles.length === 0) {
    console.log('更新対象がありません');
    await prisma.$disconnect();
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  // 各記事のIDを抽出してAPIから詳細を取得
  for (const article of emptyContentArticles) {
    try {
      // URLからユーザー名とスラッグを抽出してAPIエンドポイントを構築
      // 例: https://dev.to/username/article-slug-12345 -> username/article-slug-12345
      const urlMatch = article.url.match(/dev\.to\/(.+)$/);
      if (!urlMatch) {
        console.log(`URLパースエラー: ${article.url}`);
        continue;
      }

      const pathSegments = urlMatch[1];
      const apiUrl = `https://dev.to/api/articles/${pathSegments}`;

      console.log(`取得中: ${article.title.substring(0, 50)}...`);

      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.log(`  エラー: ${response.status} ${response.statusText}`);
        errorCount++;
        continue;
      }

      const data = await response.json() as any;
      
      // descriptionまたはbody_markdownを使用
      const content = data.description || data.body_markdown?.substring(0, 1000) || '';
      
      if (content) {
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            content: content,
            summary: null // 要約も再生成のためリセット
          }
        });
        updatedCount++;
        console.log(`  ✓ 更新完了`);
      } else {
        console.log(`  - コンテンツが取得できませんでした`);
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`  エラー: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
    }
  }

  console.log(`\n更新完了: 成功${updatedCount}件, エラー${errorCount}件`);

  await prisma.$disconnect();
}

updateDevToContent().catch(console.error);