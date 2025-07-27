import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import Parser from 'rss-parser';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const parser = new Parser();

async function fetchAdditionalArticles() {
  console.log('=== 追加記事の取得開始 ===\n');
  
  const results = {
    qiita: { new: 0, duplicate: 0 },
    zenn: { new: 0, duplicate: 0 },
    devto: { new: 0, duplicate: 0 },
    hatena: { new: 0, duplicate: 0 }
  };

  // 1. Qiita - ストック数を下げて追加取得
  console.log('📥 Qiita追加記事を取得中...');
  try {
    const qiitaSource = await prisma.source.findFirst({ where: { name: 'Qiita' } });
    if (qiitaSource) {
      for (let page = 1; page <= 5; page++) {
        const response = await axios.get('https://qiita.com/api/v2/items', {
          params: {
            page: page,
            per_page: 20,
            query: 'stocks:>5' // 通常は10以上だが、一時的に5以上に
          }
        });

        for (const item of response.data) {
          const exists = await prisma.article.findFirst({
            where: { url: item.url }
          });

          if (!exists) {
            await prisma.article.create({
              data: {
                title: item.title,
                url: item.url,
                content: item.rendered_body,
                publishedAt: new Date(item.created_at),
                sourceId: qiitaSource.id,
                // タグは後で別途処理
              }
            });
            results.qiita.new++;
          } else {
            results.qiita.duplicate++;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Qiitaエラー:', error);
  }

  // 2. Zenn - 複数カテゴリから取得
  console.log('\n📥 Zenn追加記事を取得中...');
  try {
    const zennSource = await prisma.source.findFirst({ where: { name: 'Zenn' } });
    if (zennSource) {
      const categories = ['javascript', 'typescript', 'react', 'python', 'go'];
      for (const category of categories) {
        try {
          const feed = await parser.parseURL(`https://zenn.dev/topics/${category}/feed?order=daily`);
          
          for (const item of feed.items.slice(0, 20)) {
            if (!item.link) continue;
            
            const exists = await prisma.article.findFirst({
              where: { url: item.link }
            });

            if (!exists) {
              await prisma.article.create({
                data: {
                  title: item.title || '',
                  url: item.link,
                  content: item.content || item.contentSnippet || '',
                  publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
                  sourceId: zennSource.id
                }
              });
              results.zenn.new++;
            } else {
              results.zenn.duplicate++;
            }
          }
        } catch (error) {
          console.error(`Zenn ${category}エラー:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Zennエラー:', error);
  }

  // 3. Dev.to - 反応数を下げて追加取得
  console.log('\n📥 Dev.to追加記事を取得中...');
  try {
    const devtoSource = await prisma.source.findFirst({ where: { name: 'Dev.to' } });
    if (devtoSource) {
      const tags = ['webdev', 'javascript', 'programming', 'tutorial', 'beginners'];
      
      for (const tag of tags) {
        try {
          const response = await fetch(`https://dev.to/api/articles?tag=${tag}&per_page=20&top=30`, {
            headers: { 'Accept': 'application/json' }
          });
          const articles = await response.json() as any[];

          for (const item of articles) {
            // 反応数5以上、読了時間1分以上
            if (item.positive_reactions_count >= 5 && item.reading_time_minutes >= 1) {
              const exists = await prisma.article.findFirst({
                where: { url: item.url }
              });

              if (!exists) {
                await prisma.article.create({
                  data: {
                    title: item.title,
                    url: item.url,
                    content: item.description || '',
                    publishedAt: new Date(item.published_at),
                    sourceId: devtoSource.id,
                    // タグは後で別途処理
                    bookmarks: item.positive_reactions_count || 0
                  }
                });
                results.devto.new++;
              } else {
                results.devto.duplicate++;
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Dev.to ${tag}エラー:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Dev.toエラー:', error);
  }

  // 4. はてなブックマーク - 過去の人気記事
  console.log('\n📥 はてなブックマーク追加記事を取得中...');
  try {
    const hatenaSource = await prisma.source.findFirst({ where: { name: 'はてなブックマーク' } });
    if (hatenaSource) {
      // 過去30日間の人気記事
      const feed = await parser.parseURL('https://b.hatena.ne.jp/hotentry/it.rss');
      
      for (const item of feed.items.slice(0, 50)) {
        if (!item.link) continue;
        
        const exists = await prisma.article.findFirst({
          where: { url: item.link }
        });

        if (!exists) {
          await prisma.article.create({
            data: {
              title: item.title || '',
              url: item.link,
              content: item.contentSnippet || '',
              publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
              sourceId: hatenaSource.id
            }
          });
          results.hatena.new++;
        } else {
          results.hatena.duplicate++;
        }
      }
    }
  } catch (error) {
    console.error('はてなブックマークエラー:', error);
  }

  // 結果表示
  console.log('\n=== 取得結果 ===');
  console.log(`Qiita: 新規${results.qiita.new}件, 重複${results.qiita.duplicate}件`);
  console.log(`Zenn: 新規${results.zenn.new}件, 重複${results.zenn.duplicate}件`);
  console.log(`Dev.to: 新規${results.devto.new}件, 重複${results.devto.duplicate}件`);
  console.log(`はてなブックマーク: 新規${results.hatena.new}件, 重複${results.hatena.duplicate}件`);
  
  const totalNew = Object.values(results).reduce((sum, r) => sum + r.new, 0);
  console.log(`\n合計: 新規${totalNew}件追加`);

  await prisma.$disconnect();
}

fetchAdditionalArticles().catch(console.error);