// connpass APIのテスト
const apiUrl = 'https://connpass.com/api/v1/event/';

async function testConnpassApi() {
  console.log('connpass APIをテストします...\n');
  
  try {
    const params = new URLSearchParams({
      keyword: 'JavaScript',
      order: '2', // 更新日時順
      count: '10',
    });
    
    const url = `${apiUrl}?${params}`;
    console.log('リクエストURL:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    console.log('ステータスコード:', response.status);
    console.log('ステータステキスト:', response.statusText);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('エラーレスポンス:', text);
      return;
    }
    
    const data = await response.json();
    console.log('\nレスポンスデータ:');
    console.log('- 返却件数:', data.results_returned);
    console.log('- 該当件数:', data.results_available);
    console.log('- 開始位置:', data.results_start);
    
    if (data.events && data.events.length > 0) {
      console.log('\n最初のイベント:');
      const event = data.events[0];
      console.log('- タイトル:', event.title);
      console.log('- URL:', event.event_url);
      console.log('- 開催日時:', event.started_at);
      console.log('- 場所:', event.place || 'オンライン');
    }
  } catch (error) {
    console.error('APIエラー:', error);
  }
}

testConnpassApi();