import * as cheerio from 'cheerio';

async function testSpeakerDeckFetch() {
  const url = 'https://speakerdeck.com/hiyanger/terraform-yarunarasutairugaidowodu-mou-zhong-yao-xiang-mu-10xuan';
  
  console.log(`テスト対象URL: ${url}\n`);
  
  try {
    const response = await fetch(url, {
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
    
    console.log('=== JSON-LD情報 ===');
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript);
        console.log('datePublished:', data.datePublished);
        console.log('description:', data.description ? data.description.substring(0, 100) + '...' : 'NULL');
        console.log('thumbnailUrl:', data.thumbnailUrl ? 'あり' : 'なし');
      } catch (error) {
        console.log('JSON-LD解析エラー:', error);
      }
    } else {
      console.log('JSON-LDが見つかりません');
    }
    
    console.log('\n=== HTML要素から直接取得 ===');
    const dateText = $('.deck-date').text();
    console.log('deck-date:', dateText);
    
    const description = $('.deck-description').text().trim();
    console.log('deck-description:', description ? description.substring(0, 100) + '...' : 'なし');
    
    const metaDescription = $('meta[name="description"]').attr('content');
    console.log('meta description:', metaDescription ? metaDescription.substring(0, 100) + '...' : 'なし');
    
    const ogImage = $('meta[property="og:image"]').attr('content');
    console.log('og:image:', ogImage ? 'あり' : 'なし');
    
    // ページタイトルも確認
    const pageTitle = $('title').text();
    console.log('\ntitle tag:', pageTitle);
    
    const h1Title = $('h1.deck-title').text().trim();
    console.log('h1.deck-title:', h1Title);
    
    // speaker情報
    const speaker = $('.deck-user-username').text().trim();
    console.log('\nspeaker:', speaker);
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

testSpeakerDeckFetch();