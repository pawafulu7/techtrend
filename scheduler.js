const cron = require('node-cron');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

console.log('📅 TechTrend Scheduler Started');
console.log(`⏰ 現在時刻: ${new Date().toLocaleString('ja-JP')}`);

// 毎時0分に実行（例: 1:00, 2:00, 3:00...）
cron.schedule('0 * * * *', async () => {
  const startTime = new Date();
  console.log(`\n🔄 記事更新開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // フィード収集APIを実行
    console.log('📡 フィード収集中...');
    const { stdout: collectOutput } = await execAsync('node scripts/collect-feeds.js');
    console.log(collectOutput);
    
    // 要約生成（新規記事のみ）
    console.log('📝 要約生成中...');
    const { stdout: summaryOutput } = await execAsync('node scripts/generate-summaries.js');
    console.log(summaryOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    console.log(`✅ 更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  }
});

// 初回実行（起動時）
(async () => {
  console.log('\n🚀 初回実行を開始します...');
  try {
    const { stdout: collectOutput } = await execAsync('node scripts/collect-feeds.js');
    console.log(collectOutput);
    
    const { stdout: summaryOutput } = await execAsync('node scripts/generate-summaries.js');
    console.log(summaryOutput);
    
    console.log('✅ 初回実行が完了しました\n');
    console.log('⏳ 次回の更新は毎時0分に実行されます...');
  } catch (error) {
    console.error('❌ 初回実行でエラーが発生しました:', error.message);
  }
})();

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.log('\n👋 スケジューラーを停止します...');
  process.exit(0);
});