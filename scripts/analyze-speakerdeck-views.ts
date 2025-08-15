import { speakerDeckConfig } from '../lib/config/speakerdeck';
import * as cheerio from 'cheerio';

// 一時的に設定を変更
const originalMinViews = speakerDeckConfig.minViews;
speakerDeckConfig.minViews = 0; // すべての記事を取得

async function analyzeSpeakerDeckViews() {
  console.log('📊 Speaker Deck Views分析開始...\n');
  
  const viewsDistribution: { [key: string]: number } = {
    '0-100': 0,
    '100-300': 0,
    '300-500': 0,
    '500-1000': 0,
    '1000-2000': 0,
    '2000-5000': 0,
    '5000+': 0
  };
  
  const allViews: number[] = [];
  
  try {
    for (let page = 1; page <= 5; page++) {
      const url = `https://speakerdeck.com/c/programming?lang=ja&page=${page}`;
      console.log(`📄 ページ${page}を取得中...`);
      
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      
      $('.deck-preview').each((index, element) => {
        const $item = $(element);
        const title = $item.find('a.deck-preview-link').attr('title') || '';
        
        // 日本語チェック
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title);
        if (!hasJapanese) return;
        
        // Views数を取得
        const viewsElement = $item.find('span[title*="views"]');
        const viewsTitle = viewsElement.attr('title');
        
        if (viewsTitle) {
          const viewsMatch = viewsTitle.match(/([0-9,]+)\s*views/);
          if (viewsMatch) {
            const viewsNumber = parseInt(viewsMatch[1].replace(/,/g, ''));
            allViews.push(viewsNumber);
            
            // 分布に追加
            if (viewsNumber < 100) viewsDistribution['0-100']++;
            else if (viewsNumber < 300) viewsDistribution['100-300']++;
            else if (viewsNumber < 500) viewsDistribution['300-500']++;
            else if (viewsNumber < 1000) viewsDistribution['500-1000']++;
            else if (viewsNumber < 2000) viewsDistribution['1000-2000']++;
            else if (viewsNumber < 5000) viewsDistribution['2000-5000']++;
            else viewsDistribution['5000+']++;
          }
        }
      });
    }
    
    // 統計を計算
    const total = allViews.length;
    const sorted = allViews.sort((a, b) => a - b);
    const median = sorted[Math.floor(total / 2)];
    const average = Math.round(allViews.reduce((a, b) => a + b, 0) / total);
    const percentile75 = sorted[Math.floor(total * 0.75)];
    const percentile90 = sorted[Math.floor(total * 0.90)];
    
    console.log('\n📊 Views数分布:');
    console.log('================');
    for (const [range, count] of Object.entries(viewsDistribution)) {
      const percentage = ((count / total) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 2));
      console.log(`${range.padEnd(10)} : ${count.toString().padStart(3)} (${percentage.padStart(5)}%) ${bar}`);
    }
    
    console.log('\n📈 統計情報:');
    console.log('============');
    console.log(`総記事数: ${total}`);
    console.log(`最小値: ${sorted[0]} views`);
    console.log(`最大値: ${sorted[total - 1]} views`);
    console.log(`中央値: ${median} views`);
    console.log(`平均値: ${average} views`);
    console.log(`75パーセンタイル: ${percentile75} views`);
    console.log(`90パーセンタイル: ${percentile90} views`);
    
    console.log('\n💡 現在の設定:');
    console.log('==============');
    console.log(`最小views数: ${originalMinViews} views`);
    
    const above500 = allViews.filter(v => v >= 500).length;
    const above300 = allViews.filter(v => v >= 300).length;
    const above200 = allViews.filter(v => v >= 200).length;
    
    console.log('\n📊 閾値別の記事数:');
    console.log('==================');
    console.log(`200 views以上: ${above200}件 (${((above200 / total) * 100).toFixed(1)}%)`);
    console.log(`300 views以上: ${above300}件 (${((above300 / total) * 100).toFixed(1)}%)`);
    console.log(`500 views以上: ${above500}件 (${((above500 / total) * 100).toFixed(1)}%) ← 現在の設定`);
    
    console.log('\n🎯 推奨事項:');
    console.log('============');
    if (median < 300) {
      console.log('⚠️  中央値が300未満です。500viewsの閾値は高すぎる可能性があります。');
      console.log('    → 200-300viewsへの引き下げを検討してください。');
    } else if (median > 1000) {
      console.log('✅ 中央値が1000以上です。500viewsの閾値は適切です。');
    } else {
      console.log('📌 中央値は' + median + 'viewsです。');
      console.log('    → 300viewsへの引き下げで、より多くの記事を取得できます。');
      console.log('    → 品質を重視する場合は500viewsを維持してください。');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

analyzeSpeakerDeckViews();