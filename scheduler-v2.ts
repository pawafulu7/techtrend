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
  'AWS',
  'SRE',
  'Google Developers Blog'
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
console.log('   - 要約生成: 毎日2時（深夜）');
console.log('   - クリーンアップ: 毎日3時');

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
    console.log('📝 要約・タグ生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    // 品質スコア計算
    console.log('📊 品質スコア計算中...');
    const { stdout: qualityOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-quality-scores.ts');
    console.log(qualityOutput);
    
    // 難易度レベル判定
    console.log('📈 難易度レベル判定中...');
    const { stdout: difficultyOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-difficulty-levels.ts');
    console.log(difficultyOutput);
    
    // 詳細要約生成（要約がある記事のみ）
    console.log('📄 詳細要約生成中...');
    const { stdout: detailedSummaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-detailed-summaries.ts');
    console.log(detailedSummaryOutput);
    
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
    console.log('📝 要約・タグ生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    // 品質スコア計算
    console.log('📊 品質スコア計算中...');
    const { stdout: qualityOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-quality-scores.ts');
    console.log(qualityOutput);
    
    // 難易度レベル判定
    console.log('📈 難易度レベル判定中...');
    const { stdout: difficultyOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-difficulty-levels.ts');
    console.log(difficultyOutput);
    
    // 詳細要約生成（要約がある記事のみ）
    console.log('📄 詳細要約生成中...');
    const { stdout: detailedSummaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-detailed-summaries.ts');
    console.log(detailedSummaryOutput);
    
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
    console.log('📝 要約・タグ生成中...');
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    // 品質スコア計算
    console.log('📊 品質スコア計算中...');
    const { stdout: qualityOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-quality-scores.ts');
    console.log(qualityOutput);
    
    // 難易度レベル判定
    console.log('📈 難易度レベル判定中...');
    const { stdout: difficultyOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-difficulty-levels.ts');
    console.log(difficultyOutput);
    
    // 詳細要約生成（要約がある記事のみ）
    console.log('📄 詳細要約生成中...');
    const { stdout: detailedSummaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-detailed-summaries.ts');
    console.log(detailedSummaryOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ Qiita人気記事更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ Qiita人気記事更新でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// 定期的なクリーンアップ（毎日3時）
cron.schedule('0 3 * * *', async () => {
  const startTime = new Date();
  console.log(`\n🧹 定期クリーンアップ開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // 低品質記事のクリーンアップ
    console.log('🗑️ 低品質記事のクリーンアップ中...');
    const { stdout: cleanupOutput }: ExecutionResult = await execAsync('npx tsx scripts/delete-low-quality-articles.ts');
    console.log(cleanupOutput);
    
    // 空のタグや重複タグのクリーンアップ
    console.log('🏷️ タグのクリーンアップ中...');
    const { stdout: tagCleanupOutput }: ExecutionResult = await execAsync('npx tsx scripts/clean-tags.ts');
    console.log(tagCleanupOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ クリーンアップ完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ クリーンアップでエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// 週次クリーンアップ（毎週日曜日の深夜2時）
cron.schedule('0 2 * * 0', async () => {
  const startTime = new Date();
  console.log(`\n🧹 週次クリーンアップを開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // 低品質記事の削除
    console.log('🗑️ 低品質記事を削除中...');
    const { stdout: deleteOutput }: ExecutionResult = await execAsync('npx tsx scripts/delete-low-quality-articles.ts');
    console.log(deleteOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ 週次クリーンアップ完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
  } catch (error) {
    console.error('❌ 週次クリーンアップでエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// 要約生成を深夜に実行（毎日午前2時）
// Gemini APIの負荷が低い時間帯を狙う
cron.schedule('0 2 * * *', async () => {
  const startTime = new Date();
  console.log(`\n🌙 深夜の要約生成を開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
    console.log(summaryOutput);
    
    // 成功率が低い場合は30分後に再試行
    if (summaryOutput.includes('成功率:') && summaryOutput.match(/成功率: (\d+)%/)) {
      const successRate = parseInt(RegExp.$1);
      if (successRate < 50) {
        console.log('⏰ 30分後に再試行します...');
        setTimeout(async () => {
          console.log('\n🔁 要約生成を再試行中...');
          const { stdout: retryOutput }: ExecutionResult = await execAsync('npx tsx scripts/generate-summaries.ts');
          console.log(retryOutput);
        }, 30 * 60 * 1000);
      }
    }
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`✅ 深夜の要約生成完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('❌ 深夜の要約生成でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// 初回実行（起動時） - 全ソース（要約生成はスキップ）
(async () => {
  console.log('\n🚀 初回実行を開始します（全ソース）...');
  try {
    const { stdout: collectOutput }: ExecutionResult = await execAsync('npx tsx scripts/collect-feeds.ts');
    console.log(collectOutput);
    
    // 要約生成はAPI負荷が高いためスキップ
    console.log('💡 要約生成は深夜2時に実行されます');
    
    const { stdout: qualityOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-quality-scores.ts');
    console.log(qualityOutput);
    
    const { stdout: difficultyOutput }: ExecutionResult = await execAsync('npx tsx scripts/calculate-difficulty-levels.ts');
    console.log(difficultyOutput);
    
    // 詳細要約も同様にスキップ
    console.log('💡 詳細要約生成も深夜に実行されます');
    
    console.log('✅ 初回実行が完了しました\n');
    console.log('⏳ 次回の更新:');
    console.log('   - RSS系: 毎時0分');
    console.log('   - スクレイピング系: 0時・12時');
    console.log('   - Qiita Popular: 5:05・17:05');
    console.log('   - 要約生成: 毎日2時（深夜）');
    console.log('   - クリーンアップ: 毎日3時');
    console.log('   - 週次クリーンアップ: 毎週日曜日2時');
  } catch (error) {
    console.error('❌ 初回実行でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
})();

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.log('\n👋 スケジューラーを停止します...');
  process.exit(0);
});