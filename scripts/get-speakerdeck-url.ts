import * as cheerio from 'cheerio';

async function getSpeakerDeckUrl() {
  const listUrl = 'https://speakerdeck.com/c/programming?lang=ja&page=1';
  
  console.log(`トレンドページ: ${listUrl}\n`);
  
  try {
    const response = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('=== 最初の5件のプレゼンテーション ===\n');
    
    let count = 0;
    $('.deck-preview').each((index, element) => {
      if (count >= 5) return false;
      
      const $item = $(element);
      const $link = $item.find('a.deck-preview-link');
      const href = $link.attr('href');
      const title = $link.attr('title') || $link.find('.deck-title').text().trim();
      
      if (!href || !title) return;
      
      // 日本語チェック
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title);
      if (!hasJapanese) return;
      
      const fullUrl = `https://speakerdeck.com${href}`;
      console.log(`${count + 1}. ${title}`);
      console.log(`   URL: ${fullUrl}`);
      
      // Views数も取得
      const viewsElement = $item.find('span[title*="views"]');
      const viewsTitle = viewsElement.attr('title');
      if (viewsTitle) {
        console.log(`   Views: ${viewsTitle}`);
      }
      
      console.log('');
      count++;
    });
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

getSpeakerDeckUrl();