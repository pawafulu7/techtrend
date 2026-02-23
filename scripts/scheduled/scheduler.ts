import * as cron from 'node-cron';
import { exec, spawn, ExecException, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';

// Load .env.local for local development (pm2 environment)
// In production (GHA), environment variables are set via workflow
if (process.env.NODE_ENV !== 'production' && fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

const execAsync = promisify(exec);
const DEFAULT_MAX_BUFFER = 1024 * 1024 * 10; // 10MB

interface ExecutionResult {
  stdout: string;
  stderr: string;
}

type ExecError = ExecException & {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

const isExecError = (error: unknown): error is ExecError =>
  typeof error === 'object' && error !== null && 'message' in error;

async function runCommandWithTimeout(
  stepName: string,
  command: string,
  timeoutMs: number,
  options: ExecOptions = {}
): Promise<ExecutionResult> {
  const startedAt = Date.now();
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const killSignal = options.killSignal ?? 'SIGTERM';
  const durationSeconds = () => Math.round((Date.now() - startedAt) / 1000);
  const { timeout: _ignoredTimeout, maxBuffer: _ignoredMaxBuffer, ...spawnableOptions } = options;

  console.error(`[INFO] ${stepName} started (timeout ${Math.round(timeoutMs / 1000)}s)`);

  return await new Promise<ExecutionResult>((resolve, reject) => {
    const child = spawn(command, {
      ...spawnableOptions,
      shell: spawnableOptions.shell ?? true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let bufferExceeded = false;
    let settled = false;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill(killSignal);
    }, timeoutMs);

    const maybeReject = (err: ExecError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      reject(err);
    };

    const maybeResolve = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      resolve(result);
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      process.stderr.write(chunk);

      if (stdoutBytes > maxBuffer) {
        bufferExceeded = true;
        child.kill(killSignal);
      }
    });

    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      stderrBytes += Buffer.byteLength(chunk, 'utf8');
      process.stderr.write(chunk);

      if (stderrBytes > maxBuffer) {
        bufferExceeded = true;
        child.kill(killSignal);
      }
    });

    child.on('error', (error) => {
      const execError: ExecError = Object.assign(error, {
        stdout,
        stderr,
        killed: child.killed,
        cmd: command,
        signal: null as NodeJS.Signals | null,
      });
      maybeReject(execError);
    });

    child.on('close', (code, signal) => {
      const durationSec = durationSeconds();

      if (timedOut) {
        const error = new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`) as ExecError;
        error.killed = true;
        error.signal = signal;
        error.code = null;
        error.cmd = command;
        error.stdout = stdout;
        error.stderr = stderr;
        return maybeReject(error);
      }

      if (bufferExceeded) {
        const error = new Error(`maxBuffer exceeded (${Math.round(maxBuffer / (1024 * 1024))}MB)`) as ExecError;
        error.killed = child.killed;
        error.signal = signal;
        error.code = null;
        error.cmd = command;
        error.stdout = stdout;
        error.stderr = stderr;
        return maybeReject(error);
      }

      if (code !== 0) {
        const error = new Error(`Command failed: ${command} (exit code ${code})`) as ExecError;
        error.code = code ?? null;
        error.cmd = command;
        error.killed = child.killed;
        error.signal = signal;
        error.stdout = stdout;
        error.stderr = stderr;
        return maybeReject(error);
      }

      console.error(`[INFO] ${stepName} completed in ${durationSec}s`);

      return maybeResolve({ stdout, stderr });
    });
  }).catch((error) => {
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    if (isExecError(error)) {
      if (error.killed || error.signal === 'SIGTERM' || /timed out/i.test(error.message)) {
        console.error(`[ERROR] ${stepName} timed out after ${Math.round(timeoutMs / 1000)}s (ran ${durationSec}s)`);
      } else if (/maxBuffer/i.test(error.message)) {
        console.error(
          `[ERROR] ${stepName} failed: output exceeded maxBuffer (${Math.round(maxBuffer / (1024 * 1024))}MB) after ${durationSec}s`
        );
      } else {
        console.error(`[ERROR] ${stepName} failed after ${durationSec}s: ${error.message}`);
      }

      if (error.stdout) {
        console.error(`[STDOUT] ${error.stdout}`);
      }
      if (error.stderr) {
        console.error(`[STDERR] ${error.stderr}`);
      }
    } else {
      console.error(
        `[ERROR] ${stepName} failed after ${durationSec}s: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  });
}

// RSS系ソース（1時間ごとに更新）
// All sources re-enabled with timeout protection (FETCHER_TIMEOUT_MS=60s via ecosystem.config.js, default 120s)
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
  'Google Developers Blog',
  'Hugging Face Blog',
  'Google AI Blog',
  'InfoQ Japan',
  'GitHub Blog',
  'Cloudflare Blog',
  'Mozilla Hacks',
  'Hacker News',
  'Medium Engineering',
  // AI/LLM専門ソース
  'OpenAI Blog',
  'Hugging Face Papers',
  // 'arXiv AI' は専用スケジュールで実行（1日2回: JST 14:30, 02:30）
  'Zenn AI',
  'Qiita AI',
  'NVIDIA Developer Blog',
  'DeepMind Blog',
  // 国内企業ブログ（13社）
  'DeNA Engineering',
  'CyberAgent Developers Blog',
  'Mercari Engineering',
  'LY Corporation Tech Blog',
  'ZOZO TECH BLOG',
  'Money Forward Developers Blog',
  'SmartHR Tech Blog',
  'Cookpad Tech Life',
  'freee Developers Hub',
  'Hatena Developer Blog',
  'Sansan Builders Box',
  'GMO Developers',
  'ペパボテックブログ',
  // DevelopersIO（クラスメソッド社）
  'DevelopersIO AWS',
  'DevelopersIO AI',
  'DevelopersIO Claude',
  'DevelopersIO MCP',
  'DevelopersIO Security',
  // 企業技術ブログ一覧（hatena.blog/dev/entries）
  '企業技術ブログ',
  // 海外テック企業エンジニアリングブログ（Phase 1）
  'Meta Engineering',
  'Netflix TechBlog',
  'Spotify Engineering',
  'Pinterest Engineering',
  // 海外テック企業エンジニアリングブログ（Phase 2）
  'Stripe Engineering',
  'Discord Engineering',
  'Slack Engineering',
  'The New Stack',
  'CNCF Blog',
  'Chrome Developers',
  'Kubernetes Blog',
  'Go Blog',
  'Rust Blog',
];

// スクレイピング系ソース（12時間ごとに更新）
const SCRAPING_SOURCES = [
  'Speaker Deck',
  'Docswell'
];

// Qiita人気記事ソース（5:05と17:05に更新）
const QIITA_POPULAR_SOURCE = ['Qiita Popular'];

// 共通の更新処理を関数として抽出
async function executeUpdatePipeline(
  sources: string[], 
  label: string,
  options?: {
    skipSummaries?: boolean;
  }
): Promise<void> {
  const startTime = new Date();
  console.error(`\n[INFO] ${label}更新開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    const sourceArgs = sources.map(s => `"${s}"`).join(' ');
    await runCommandWithTimeout(
      'フィード収集',
      `npx tsx scripts/scheduled/collect-feeds.ts ${sourceArgs}`,
      15 * 60 * 1000
    );
    
    // 2. Google Developers Blogのコンテンツエンリッチメント
    if (sources.includes('Google Developers Blog')) {
      console.error('[INFO] Google Developers Blogのコンテンツをエンリッチ中...');
      try {
        const { stdout: enrichOutput }: ExecutionResult = await execAsync(
          'npx tsx scripts/maintenance/enrich-google-dev-content.ts'
        );
        console.error(enrichOutput);
      } catch (error) {
        console.error(
          '[WARN] Google Dev Blogエンリッチメントでエラー（続行）:',
          error instanceof Error ? error.message : String(error)
        );
        // エラーが発生しても他の処理は続行
      }
    }
    
    // 2.5. AWSのコンテンツエンリッチメント
    if (sources.includes('AWS')) {
      console.error('[INFO] AWS記事のコンテンツをエンリッチ中...');
      try {
        const { stdout: enrichOutput, stderr: enrichError }: ExecutionResult = await execAsync(
          'npx tsx scripts/maintenance/enrich-aws-content.ts',
          {
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            timeout: 300000, // 5分のタイムアウト
          }
        );
        
        // stdoutとstderrの両方をログ出力
        if (enrichOutput) {
          console.error(enrichOutput);
        }
        if (enrichError) {
          console.error('[WARN] AWS enrichment stderr:', enrichError);
        }
      } catch (error) {
        console.error('[WARN] AWSエンリッチメントでエラー（続行）:', error instanceof Error ? error.message : String(error));
        // エラーが発生しても他の処理は続行
      }
    }
    
    // 3. 要約生成（オプション）
    if (!options?.skipSummaries) {
      await runCommandWithTimeout(
        '要約・タグ生成',
        'npx tsx scripts/scheduled/manage-summaries.ts generate',
        10 * 60 * 1000
      );
    }
    
    // 4. 品質スコア計算
    await runCommandWithTimeout(
      '品質スコア計算',
      'npx tsx scripts/scheduled/manage-quality-scores.ts calculate',
      5 * 60 * 1000
    );
    
    // 5. 難易度レベル判定
    await runCommandWithTimeout(
      '難易度レベル判定',
      'npx tsx scripts/scheduled/calculate-difficulty-levels.ts',
      5 * 60 * 1000
    );
    
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.error(`[INFO] ${label}更新完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error(
      `[ERROR] ${label}更新でエラーが発生しました:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error; // 上位でハンドリング可能にする
  }
}

console.error('[INFO] TechTrend Scheduler V2 Started');
console.error(`[INFO] 現在時刻: ${new Date().toLocaleString('ja-JP')}`);
console.error('[INFO] 更新スケジュール:');
console.error('   - RSS系: 毎時0分');
console.error('   - Embeddingリカバリ: 毎時15分');
console.error('   - スクレイピング系: 0:30・12:30');
console.error('   - Qiita Popular: 5:05・17:05');
console.error('   - 要約生成: 毎日10:30（午前）');
console.error('   - Daily Trend生成: 毎日14:30');
console.error('   - タグ生成: 8:30・20:30');
console.error('   - クリーンアップ: 毎日22時');

// Job lock to prevent concurrent executions
let rssJobRunning = false;
let scrapingJobRunning = false;
let qiitaJobRunning = false;
let embeddingRecoveryRunning = false;
let trendReportJobRunning = false;

// EmbeddingScheduler instance for auto-recovery
const embeddingScheduler = new EmbeddingScheduler();

// RSS系ソースの更新（毎時0分）
cron.schedule('0 * * * *', async () => {
  if (rssJobRunning) {
    console.error('[WARN] RSS job already running, skipping this execution');
    return;
  }
  rssJobRunning = true;
  try {
    await executeUpdatePipeline(RSS_SOURCES, 'RSS系記事');
  } catch (error) {
    // エラーは関数内でログ出力済み
  } finally {
    rssJobRunning = false;
  }
});

// Embeddingジョブリカバリ（毎時15分）
// RSS更新（毎時0分）の15分後に実行
// 環境変数で閾値とバッチサイズを設定可能
const EMBEDDING_STUCK_THRESHOLD = parseInt(process.env.EMBEDDING_STUCK_THRESHOLD_MINUTES || '30', 10);
const EMBEDDING_RECOVERY_LIMIT = parseInt(process.env.EMBEDDING_RECOVERY_BATCH_LIMIT || '100', 10);

cron.schedule('15 * * * *', async () => {
  if (embeddingRecoveryRunning) {
    console.error('[WARN] Embedding recovery job already running, skipping');
    return;
  }
  embeddingRecoveryRunning = true;
  const startTime = Date.now();

  try {
    const result = await embeddingScheduler.recoverStuckJobs(
      EMBEDDING_STUCK_THRESHOLD,
      EMBEDDING_RECOVERY_LIMIT
    );

    const duration = Math.round((Date.now() - startTime) / 1000);

    if (result.found > 0) {
      console.error(
        `[INFO] Embedding recovery completed in ${duration}s: ` +
        `found=${result.found}, reset=${result.reset}, skipped=${result.skipped}` +
        (result.oldestAgeMinutes ? `, oldestAge=${result.oldestAgeMinutes}min` : '')
      );
    } else {
      console.error(`[INFO] Embedding recovery: no stuck jobs found (${duration}s)`);
    }
  } catch (error) {
    console.error(
      '[ERROR] Embedding recovery failed:',
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    embeddingRecoveryRunning = false;
  }
});

// スクレイピング系ソースの更新（0:30と12:30）
// RSS系（毎時0分）との競合を避けるため30分ずらす
cron.schedule('30 0,12 * * *', async () => {
  if (scrapingJobRunning) {
    console.error('[WARN] Scraping job already running, skipping this execution');
    return;
  }
  scrapingJobRunning = true;
  try {
    await executeUpdatePipeline(SCRAPING_SOURCES, 'スクレイピング系記事');
  } catch (error) {
    // エラーは関数内でログ出力済み
  } finally {
    scrapingJobRunning = false;
  }
});

// Qiita人気記事の更新（5:05と17:05）
cron.schedule('5 5,17 * * *', async () => {
  if (qiitaJobRunning) {
    console.error('[WARN] Qiita job already running, skipping this execution');
    return;
  }
  qiitaJobRunning = true;
  try {
    await executeUpdatePipeline(QIITA_POPULAR_SOURCE, 'Qiita人気記事');
  } catch (error) {
    // エラーは関数内でログ出力済み
  } finally {
    qiitaJobRunning = false;
  }
});

// 定期的なクリーンアップ（毎日22時）
cron.schedule('0 22 * * *', async () => {
  const startTime = new Date();
  console.error(`\n[INFO] 定期クリーンアップ開始: ${startTime.toLocaleString('ja-JP')}`);

  try {
    // 空のタグや重複タグのクリーンアップ
    console.error('[INFO] タグのクリーンアップ中...');
    const { stdout: tagCleanupOutput }: ExecutionResult = await execAsync('npx tsx scripts/scheduled/clean-tags.ts');
    console.error(tagCleanupOutput);

    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.error(`[INFO] クリーンアップ完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);

  } catch (error) {
    console.error('[ERROR] クリーンアップでエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});


// 毎日午後3時30分に品質チェックと自動再生成を実行
cron.schedule('30 15 * * *', async () => {
  const startTime = new Date();
  console.error(`\n[INFO] 品質チェックと自動再生成を開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    // まず品質チェックを実行
    console.error('[INFO] 品質チェックを実行中...');
    const { stdout: qualityOutput }: ExecutionResult = await execAsync('npx tsx scripts/scheduled/quality-check.ts --days 7 --auto-regenerate');
    console.error(qualityOutput);
    
    // 次に低品質記事の自動再生成を実行
    console.error('[INFO] 低品質記事の自動再生成を実行中...');
    const { stdout: regenerateOutput }: ExecutionResult = await execAsync('npx tsx scripts/scheduled/auto-regenerate-low-quality.ts --threshold 70 --limit 10');
    console.error(regenerateOutput);
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.error(`[INFO] 品質チェックと自動再生成が完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('[ERROR] 品質チェック・自動再生成でエラーが発生しました:', 
      error instanceof Error ? error.message : String(error));
  }
});

// 要約生成を午前に実行（毎日午前10時30分）
// タグ生成バッチ（8:30）の後に実行
cron.schedule('30 10 * * *', async () => {
  const startTime = new Date();
  console.error(`\n[INFO] 要約生成を開始: ${startTime.toLocaleString('ja-JP')}`);
  
  try {
    const { stdout: summaryOutput }: ExecutionResult = await execAsync('npx tsx scripts/scheduled/manage-summaries.ts generate --batch 5 --limit 30');
    console.error(summaryOutput);
    
    // 成功率が低い場合は30分後に再試行
    const successRateMatch = summaryOutput.match(/成功率: (\d+)%/);
    if (summaryOutput.includes('成功率:') && successRateMatch) {
      const successRate = parseInt(successRateMatch[1]);
      if (successRate < 50) {
        console.error('[INFO] 30分後に再試行します...');
        setTimeout(async () => {
          console.error('\n[INFO] 要約生成を再試行中...');
          const { stdout: retryOutput }: ExecutionResult = await execAsync('npx tsx scripts/scheduled/manage-summaries.ts generate --batch 5 --limit 30');
          console.error(retryOutput);
        }, 30 * 60 * 1000);
      }
    }
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.error(`[INFO] 要約生成完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);
    
  } catch (error) {
    console.error('[ERROR] 要約生成でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
});

// タグ生成バッチ（8:30と20:30）
// RSS取得バッチとの競合を避けるため、30分ずらして実行
cron.schedule('30 8,20 * * *', async () => {
  const startTime = new Date();
  console.error(`\n[INFO] タグ生成バッチを開始: ${startTime.toLocaleString('ja-JP')}`);

  try {
    const { stdout: tagOutput }: ExecutionResult = await execAsync(
      'npx tsx scripts/scheduled/generate-tags.ts'
    );
    console.error(tagOutput);

    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.error(`[INFO] タグ生成バッチ完了: ${endTime.toLocaleString('ja-JP')} (${duration}秒)`);

  } catch (error) {
    console.error('[ERROR] タグ生成バッチでエラーが発生しました:',
      error instanceof Error ? error.message : String(error));
  }
});

// Daily Trend Report生成（毎日14:30 JST）
// ※ ローカル環境専用（本番はGitHub Actions scheduler-trend-report.yml で実行）
cron.schedule('30 14 * * *', async () => {
  if (trendReportJobRunning) {
    console.error('[WARN] Trend report job already running, skipping');
    return;
  }
  trendReportJobRunning = true;
  const startTime = new Date();
  console.error(`\n[INFO] Daily Trend Report生成を開始: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

  try {
    await runCommandWithTimeout(
      'Daily Trend Report生成',
      'npx tsx scripts/scheduled/generate-trend-report.ts --type daily',
      15 * 60 * 1000 // 15分タイムアウト
    );
    const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
    console.error(`[INFO] Daily Trend Report生成完了: ${duration}秒`);
  } catch (error) {
    console.error('[ERROR] Daily Trend Report生成でエラー:', error instanceof Error ? error.message : String(error));
  } finally {
    trendReportJobRunning = false;
  }
}, { timezone: 'Asia/Tokyo' });

// 初回実行（起動時）
(async () => {
  console.error('\n[INFO] 初回実行を開始します...');
  try {
    const allSources = [...RSS_SOURCES, ...SCRAPING_SOURCES];

    // 要約生成はスキップ（再起動時の追加通知を防止）
    // 要約生成は10:30の定期ジョブで実行される
    await executeUpdatePipeline(allSources, '初回実行', { skipSummaries: true });
    
    console.error('[INFO] 要約生成は午前10:30に実行されます');
    
    console.error('[INFO] 初回実行が完了しました\n');
    console.error('[INFO] 次回の更新:');
    console.error('   - RSS系: 毎時0分');
    console.error('   - Embeddingリカバリ: 毎時15分');
    console.error('   - スクレイピング系: 0:30・12:30');
    console.error('   - Qiita Popular: 5:05・17:05');
    console.error('   - Daily Trend生成: 毎日14:30（JST）');
    console.error('   - 品質チェック・再生成: 毎日15:30');
    console.error('   - タグ生成: 8:30・20:30');
    console.error('   - 要約生成: 毎日10:30（午前）');
    console.error('   - クリーンアップ: 毎日22時');
    console.error('   - 週次クリーンアップ: 毎週日曜日2時');
  } catch (error) {
    console.error('[ERROR] 初回実行でエラーが発生しました:', error instanceof Error ? error.message : String(error));
  }
})();

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.error('\n[INFO] スケジューラーを停止します...');
  process.exit(0);
});
