// InfoQ Japan RSSフィードのテスト
const rssUrl = 'https://www.infoq.com/jp/feed';

async function testInfoQRss() {
  console.log('InfoQ Japan RSSフィードをテストします...\n');
  
  try {
    console.log('リクエストURL:', rssUrl);
    
    const response = await fetch(rssUrl, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; TechTrendAggregator/1.0)'
      }
    });
    
    console.log('ステータスコード:', response.status);
    console.log('ステータステキスト:', response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (!response.ok) {
      const text = await response.text();
      console.error('\nエラーレスポンス:');
      console.error(text.substring(0, 500));
      return;
    }
    
    const text = await response.text();
    console.log('\nレスポンスの最初の500文字:');
    console.log(text.substring(0, 500));
    
    // XMLかどうかチェック
    if (text.startsWith('<?xml') || text.includes('<rss')) {
      console.log('\n✓ 有効なRSSフィードです');
    } else {
      console.log('\n✗ RSSフィードではありません');
    }
  } catch (error) {
    console.error('フェッチエラー:', error);
  }
}

testInfoQRss();