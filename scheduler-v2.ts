import * as cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ExecutionResult {
  stdout: string;
  stderr: string;
}

// RSS系ソース（1時間ごとに更新）
const RSS_SOURCES = [
  'はてなブックマーク',
  'Zenn',
  'Dev.to',
  'Publickey',
  'Stack Overflow Blog',
  'Think IT',
  'Rails Releases',
  'AWS Security Bulletins',
  'AWS What\'s New',
  'AWS News Blog'
];

// スクレイピング系ソース（12時間ごとに更新）
const SCRAPING_SOURCES = [
  'Speaker Deck'
];

// Qiita人気記事ソース（5:05と17:05に更新）
const QIITA_POPULAR_SOURCE = ['Qiita Popular'];

console.log('📅 TechTrend Scheduler V2 Started');
console.log(`⏰ 現在時刻: ${new Date().toLocaleString('ja-JP')}`);
console.log('📊 更新スケジュール:');
console.log('   - RSS系: 毎時0分');
console.log('   - スクレイピング系: 0時・12時');
console.log('   - Qiita Popular: 5:05・17:05');

// RSS系ソースの更新（毎時0分）
cron.schedule('0 * * * *', async () => {
  const startTime = new Date();
  console.log(`\n🔄 RSS系記事更新開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // RSS系ソースのみフィード収集
    console.log('📡 RSS系フィード収集中...');
    const sourceArgs = RSS_SOURCES.map(s => `"${s}"`).join(' ');
    const { stdout: collectOutput }: ExecutionResult = await execAsync(`npx tsx scripts/collect-feeds.ts ${sourceArgs}`);
    console.log(collectOutput);
    
    // 要約生成（新規記事のみ）
    console.log('📝 要約生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ RSS系更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ RSS系更新でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// スクレイピング系ソースの更新（0時と12時）
cron.schedule('0 0,12 * * *', async () => {
  const startTime = new Date();
  console.log(`\n🔄 スクレイピング系記事更新開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // スクレイピング系ソースのみフィード収集
    console.log('📡 スクレイピング系フィード収集中...');
    const sourceArgs = SCRAPING_SOURCES.map(s => `"${s}"`).join(' ');
    const { stdout: collectOutput }: ExecutionResult = await execAsync(`npx tsx scripts/collect-feeds.ts ${sourceArgs}`);
    console.log(collectOutput);
    
    // 要約生成（新規記事のみ）
    console.log('📝 要約生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ スクレイピング系更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ スクレイピング系更新でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// Qiita人気記事の更新（5:05と17:05）
cron.schedule('5 5,17 * * *', async () => {
  const startTime = new Date();
  console.log(`\n🔄 Qiita人気記事更新開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // Qiita Popularのみフィード収集
    console.log('📡 Qiita人気記事フィード収集中...');
    const sourceArgs = QIITA_POPULAR_SOURCE.map(s => `"${s}"`).join(' ');
    const { stdout: collectOutput }: ExecutionResult = await execAsync(`npx tsx scripts/collect-feeds.ts ${sourceArgs}`);
    console.log(collectOutput);
    
    // 要約生成（新規記事のみ）
    console.log('📝 要約生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ Qiita人気記事更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ Qiita人気記事更新でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// 初回実行（起動時） - 全ソース
(async () => {
  console.log('\n🚀 初回実行を開始します（全ソース）...');
  try {
    const { stdout: collectOutput }: ExecutionResult = await execAsync('npx tsx scripts/collect-feeds.ts');
    console.log(collectOutput);
    
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    console.log('✅ 初回実行が完了しました\n');
    console.log('⏳ 次回の更新:');
    console.log('   - RSS系: 毎時0分');
    console.log('   - スクレイピング系: 0時・12時');
    console.log('   - Qiita Popular: 5:05・17:05');
  } catch (error) {
    console.error('❌ 初回実行でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
})();

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.log('\n👋 スケジューラーを停止します...');
  process.exit(0);
});