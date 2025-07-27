import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

async function fetchPublickeyFromWeb() {
  console.log('=== Publickey Webスクレイピング ===\n');
  
  let newCount = 0;
  let duplicateCount = 0;

  try {
    const publickeySource = await prisma.source.findFirst({ where: { name: 'Publickey' } });
    if (!publickeySource) {
      console.log('Publickeyソースが見つかりません');
      return;
    }

    // アーカイブページから過去記事を取得
    const years = [2024, 2023];
    const months = Array.from({length: 12}, (_, i) => i + 1);

    for (const year of years) {
      for (const month of months) {
        if (year === 2024 && month > 7) continue; // 2024年7月まで
        
        const archiveUrl = `https://www.publickey1.jp/${year}/${month.toString().padStart(2, '0')}/`;
        console.log(`📥 アーカイブ取得: ${archiveUrl}`);
        
        try {
          const response = await fetch(archiveUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (!response.ok) {
            console.log(`  スキップ: ${response.status}`);
            continue;
          }
          
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // 記事リンクを抽出
          $('h3.entry-title a').each(async (_, element) => {
            const $link = $(element);
            const title = $link.text().trim();
            const url = $link.attr('href');
            
            if (!url || !title) return;
            
            // 絶対URLに変換
            const absoluteUrl = url.startsWith('http') ? url : `https://www.publickey1.jp${url}`;
            
            try {
              const exists = await prisma.article.findFirst({
                where: { url: absoluteUrl }
              });

              if (!exists) {
                await prisma.article.create({
                  data: {
                    title: title,
                    url: absoluteUrl,
                    content: '', // 後で詳細ページから取得可能
                    publishedAt: new Date(year, month - 1, 15), // 月の中旬として設定
                    sourceId: publickeySource.id
                  }
                });
                newCount++;
                console.log(`  ✓ 新規: ${title.substring(0, 40)}...`);
              } else {
                duplicateCount++;
              }
            } catch (error) {
              // 個別エラーは無視
            }
          });
          
          // レート制限対策
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`  エラー: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  } catch (error) {
    console.error('エラー:', error);
  }

  console.log(`\n=== 結果 ===`);
  console.log(`新規: ${newCount}件, 重複: ${duplicateCount}件`);

  await prisma.$disconnect();
}

fetchPublickeyFromWeb().catch(console.error);