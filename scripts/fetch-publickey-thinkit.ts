import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';

const prisma = new PrismaClient();
const parser = new Parser();

async function fetchPublickeyThinkIT() {
  console.log('=== PublickeyとThink ITの追加記事取得 ===\n');
  
  const results = {
    publickey: { new: 0, duplicate: 0 },
    thinkit: { new: 0, duplicate: 0 }
  };

  // 1. Publickey - 複数のフィードから取得
  console.log('📥 Publickey追加記事を取得中...');
  try {
    const publickeySource = await prisma.source.findFirst({ where: { name: 'Publickey' } });
    if (publickeySource) {
      const feeds = [
        'https://www.publickey1.jp/atom.xml',
        'https://www.publickey2.jp/atom.xml', 
        'https://www.publickey1.jp/blog/cloud/atom.xml',
        'https://www.publickey1.jp/blog/serverless/atom.xml',
        'https://www.publickey1.jp/blog/container/atom.xml',
        'https://www.publickey1.jp/blog/kubernetes/atom.xml',
        'https://www.publickey1.jp/blog/devops/atom.xml',
        'https://www.publickey1.jp/blog/programming/atom.xml',
        'https://www.publickey1.jp/blog/database/atom.xml',
        'https://www.publickey1.jp/blog/web_technology/atom.xml'
      ];

      for (const feedUrl of feeds) {
        try {
          console.log(`  フィード取得: ${feedUrl}`);
          const feed = await parser.parseURL(feedUrl);
          
          for (const item of (feed.items || []).slice(0, 20)) {
            if (!item.link || !item.title) continue;
            
            const exists = await prisma.article.findFirst({
              where: { url: item.link }
            });

            if (!exists) {
              await prisma.article.create({
                data: {
                  title: item.title,
                  url: item.link,
                  content: item.contentSnippet || item.content || '',
                  publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
                  sourceId: publickeySource.id
                }
              });
              results.publickey.new++;
            } else {
              results.publickey.duplicate++;
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`  エラー (${feedUrl}):`, error instanceof Error ? error.message : error);
        }
      }
    }
  } catch (error) {
    console.error('Publickeyエラー:', error);
  }

  // 2. Think IT - メインフィードとカテゴリ別フィード
  console.log('\n📥 Think IT追加記事を取得中...');
  try {
    const thinkitSource = await prisma.source.findFirst({ where: { name: 'Think IT' } });
    if (thinkitSource) {
      const feeds = [
        'https://thinkit.co.jp/rss.xml',
        'https://thinkit.co.jp/taxonomy/term/1361/feed', // クラウド
        'https://thinkit.co.jp/taxonomy/term/1362/feed', // DevOps
        'https://thinkit.co.jp/taxonomy/term/1363/feed', // AI/機械学習
        'https://thinkit.co.jp/taxonomy/term/1364/feed', // セキュリティ
        'https://thinkit.co.jp/taxonomy/term/1365/feed', // データベース
        'https://thinkit.co.jp/taxonomy/term/1366/feed', // プログラミング
        'https://thinkit.co.jp/taxonomy/term/1367/feed', // ネットワーク
        'https://thinkit.co.jp/taxonomy/term/1368/feed', // OS/ミドルウェア
      ];

      for (const feedUrl of feeds) {
        try {
          console.log(`  フィード取得: ${feedUrl}`);
          const feed = await parser.parseURL(feedUrl);
          
          for (const item of (feed.items || []).slice(0, 20)) {
            if (!item.link || !item.title) continue;
            
            const exists = await prisma.article.findFirst({
              where: { url: item.link }
            });

            if (!exists) {
              // サムネイル画像の抽出
              let thumbnail: string | undefined;
              if (item.content) {
                const imgMatch = item.content.match(/<img[^>]*src="([^"]+)"/);
                if (imgMatch && imgMatch[1]) {
                  thumbnail = imgMatch[1];
                }
              }

              await prisma.article.create({
                data: {
                  title: item.title,
                  url: item.link,
                  content: item.contentSnippet || item.content || '',
                  thumbnail: thumbnail,
                  publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
                  sourceId: thinkitSource.id
                }
              });
              results.thinkit.new++;
            } else {
              results.thinkit.duplicate++;
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`  エラー (${feedUrl}):`, error instanceof Error ? error.message : error);
        }
      }
    }
  } catch (error) {
    console.error('Think ITエラー:', error);
  }

  // 結果表示
  console.log('\n=== 取得結果 ===');
  console.log(`Publickey: 新規${results.publickey.new}件, 重複${results.publickey.duplicate}件`);
  console.log(`Think IT: 新規${results.thinkit.new}件, 重複${results.thinkit.duplicate}件`);
  
  const totalNew = results.publickey.new + results.thinkit.new;
  console.log(`\n合計: 新規${totalNew}件追加`);

  await prisma.$disconnect();
}

fetchPublickeyThinkIT().catch(console.error);