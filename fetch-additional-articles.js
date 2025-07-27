// 各ソースから追加で100件ずつ記事を取得するスクリプト
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

async function fetchAdditionalArticles() {
  try {
    console.log('=== 追加記事取得開始 ===\n');

    // 1. Qiitaから追加100件取得（ストック数順）
    console.log('【Qiita】トレンド記事を取得中...');
    const qiitaArticles = [];
    
    // ページ3から6まで取得（既に1-2ページは取得済みなので）
    for (let page = 3; page <= 6; page++) {
      try {
        const response = await axios.get('https://qiita.com/api/v2/items', {
          params: {
            page: page,
            per_page: 25,
            query: 'stocks:>3' // ストック数3以上に緩和して多く取得
          },
          headers: {
            'Accept': 'application/json',
          },
          timeout: 10000,
        });

        console.log(`  ページ${page}: ${response.data.length}件取得`);
        qiitaArticles.push(...response.data);

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  Qiitaエラー (page ${page}):`, error.message);
      }
    }

    console.log(`  合計: ${qiitaArticles.length}件\n`);

    // Qiita記事をデータベースに保存
    const qiitaSource = await prisma.source.findFirst({
      where: { name: 'Qiita' }
    });

    if (qiitaSource && qiitaArticles.length > 0) {
      let savedCount = 0;
      for (const item of qiitaArticles) {
        try {
          // 既存記事チェック
          const existing = await prisma.article.findFirst({
            where: { url: item.url }
          });

          if (!existing) {
            await prisma.article.create({
              data: {
                title: item.title,
                url: item.url,
                summary: '', // 後で生成
                content: item.rendered_body,
                publishedAt: new Date(item.created_at),
                sourceId: qiitaSource.id,
                // tagNamesは使えないので、tagsとして処理は後で実装
                thumbnail: item.user.profile_image_url,
              }
            });
            savedCount++;
          }
        } catch (error) {
          console.error(`  保存エラー:`, error.message);
        }
      }
      console.log(`  Qiita: ${savedCount}件の新規記事を保存\n`);
    }

    // 2. 他のRSSソースから最新記事を取得
    const rssSources = await prisma.source.findMany({
      where: {
        type: 'RSS',
        enabled: true,
        NOT: {
          name: 'connpass' // connpassはAPI
        }
      }
    });

    console.log('【RSS】各ソースから最新記事を取得中...');
    for (const source of rssSources) {
      console.log(`\n${source.name}を処理中...`);
      
      // 各フェッチャーのインスタンスを作成して実行
      try {
        const FetcherClass = require(`./lib/fetchers/${source.name.toLowerCase().replace(/[\s.]/g, '-')}.js`).default || 
                            require(`./lib/fetchers/${source.name.toLowerCase().replace(/[\s.]/g, '-')}.js`)[Object.keys(require(`./lib/fetchers/${source.name.toLowerCase().replace(/[\s.]/g, '-')}.js`))[0]];
        
        const fetcher = new FetcherClass(source);
        const result = await fetcher.fetch();
        
        console.log(`  取得: ${result.articles.length}件`);
        
        // 記事を保存
        let savedCount = 0;
        for (const article of result.articles) {
          try {
            const existing = await prisma.article.findFirst({
              where: { url: article.url }
            });

            if (!existing) {
              await prisma.article.create({
                data: {
                  ...article,
                  sourceId: source.id,
                  summary: article.summary || '', // 後で生成
                }
              });
              savedCount++;
            }
          } catch (error) {
            // エラーは無視して続行
          }
        }
        console.log(`  保存: ${savedCount}件の新規記事`);
      } catch (error) {
        console.error(`  ${source.name}のフェッチャーエラー:`, error.message);
      }
    }

    // 3. Dev.toから追加記事取得
    console.log('\n【Dev.to】最新記事を取得中...');
    try {
      const devtoSource = await prisma.source.findFirst({
        where: { name: 'Dev.to' }
      });

      if (devtoSource) {
        const devtoResponse = await axios.get('https://dev.to/api/articles', {
          params: {
            per_page: 100,
            top: 7 // 過去7日間のトップ記事
          }
        });

        console.log(`  取得: ${devtoResponse.data.length}件`);

        let savedCount = 0;
        for (const article of devtoResponse.data) {
          try {
            const existing = await prisma.article.findFirst({
              where: { url: article.url }
            });

            if (!existing) {
              await prisma.article.create({
                data: {
                  title: article.title,
                  url: article.url,
                  summary: article.description || '',
                  content: article.body_html || article.body_markdown || '',
                  publishedAt: new Date(article.published_at),
                  sourceId: devtoSource.id,
                  // tagNamesは使えないので、コメントアウト
                  thumbnail: article.cover_image || article.social_image,
                }
              });
              savedCount++;
            }
          } catch (error) {
            // エラーは無視
          }
        }
        console.log(`  保存: ${savedCount}件の新規記事`);
      }
    } catch (error) {
      console.error('  Dev.toエラー:', error.message);
    }

    // 4. 統計を表示
    console.log('\n=== 取得完了 ===');
    const totalArticles = await prisma.article.count();
    const articlesBySource = await prisma.article.groupBy({
      by: ['sourceId'],
      _count: {
        _all: true
      }
    });

    console.log(`\n総記事数: ${totalArticles}件`);
    console.log('\nソース別記事数:');
    for (const stat of articlesBySource) {
      const source = await prisma.source.findUnique({
        where: { id: stat.sourceId }
      });
      console.log(`  ${source.name}: ${stat._count._all}件`);
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fetchAdditionalArticles();