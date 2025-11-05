import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { join } from 'path';

interface StartupMeasurement {
  mode: 'turbopack' | 'webpack';
  startupTimeMs: number;
  timestamp: string;
  nodeVersion: string;
  nextVersion: string;
}

async function measureStartupTime(mode: 'turbopack' | 'webpack', runs: number = 3): Promise<number[]> {
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    console.log(`\n[${mode.toUpperCase()}] Run ${i + 1}/${runs}...`);

    const startTime = performance.now();
    const command = mode === 'turbopack' ? 'dev' : 'dev:webpack';

    const child = spawn('npm', ['run', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let resolved = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout after 120 seconds')), 120000);
    });

    const readyPromise = new Promise<void>((resolve) => {
      child.stdout?.on('data', (data) => {
        const output = data.toString();

        if (output.includes('Ready in') || output.includes('started server')) {
          if (!resolved) {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            const endTime = performance.now();
            const duration = endTime - startTime;
            times.push(duration);
            console.log(`  Startup time: ${(duration / 1000).toFixed(2)}s`);

            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 2000);

            resolve();
          }
        }
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Error') || output.includes('error')) {
          console.error('  Error:', output);
        }
      });

      child.on('exit', () => {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        }
      });
    });

    try {
      await Promise.race([readyPromise, timeoutPromise]);
    } catch (error) {
      console.error(`  Failed: ${(error as Error).message}`);
      child.kill('SIGKILL');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (i < runs - 1) {
      console.log('  Waiting 5 seconds before next run...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  return times;
}

async function main() {
  console.log('='.repeat(50));
  console.log('Development Server Startup Time Measurement');
  console.log('='.repeat(50));

  const args = process.argv.slice(2);
  const runs = parseInt(args.find(a => a.startsWith('--runs='))?.split('=')[1] || '3');
  const mode = args.includes('--webpack-only') ? 'webpack' :
               args.includes('--turbopack-only') ? 'turbopack' :
               'both';

  console.log(`\nRuns per mode: ${runs}`);
  console.log(`Mode: ${mode}\n`);

  const results: StartupMeasurement[] = [];

  if (mode === 'both' || mode === 'webpack') {
    const webpackTimes = await measureStartupTime('webpack', runs);
    const avgWebpack = webpackTimes.reduce((a, b) => a + b, 0) / webpackTimes.length;

    results.push({
      mode: 'webpack',
      startupTimeMs: avgWebpack,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      nextVersion: '15.5.2',
    });

    console.log(`\n[WEBPACK] Average: ${(avgWebpack / 1000).toFixed(2)}s`);
    console.log(`  Min: ${(Math.min(...webpackTimes) / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(Math.max(...webpackTimes) / 1000).toFixed(2)}s`);
  }

  if (mode === 'both' || mode === 'turbopack') {
    const turbopackTimes = await measureStartupTime('turbopack', runs);
    const avgTurbopack = turbopackTimes.reduce((a, b) => a + b, 0) / turbopackTimes.length;

    results.push({
      mode: 'turbopack',
      startupTimeMs: avgTurbopack,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      nextVersion: '15.5.2',
    });

    console.log(`\n[TURBOPACK] Average: ${(avgTurbopack / 1000).toFixed(2)}s`);
    console.log(`  Min: ${(Math.min(...turbopackTimes) / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(Math.max(...turbopackTimes) / 1000).toFixed(2)}s`);
  }

  if (results.length === 2) {
    const webpack = results.find(r => r.mode === 'webpack')!;
    const turbopack = results.find(r => r.mode === 'turbopack')!;
    const improvement = ((webpack.startupTimeMs - turbopack.startupTimeMs) / webpack.startupTimeMs) * 100;

    console.log('\n' + '='.repeat(50));
    console.log('COMPARISON');
    console.log('='.repeat(50));
    console.log(`Webpack:   ${(webpack.startupTimeMs / 1000).toFixed(2)}s`);
    console.log(`Turbopack: ${(turbopack.startupTimeMs / 1000).toFixed(2)}s`);
    console.log(`Improvement: ${improvement.toFixed(1)}% faster`);
  }

  const reportPath = join(process.cwd(), 'scripts/performance/startup-times.json');
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${reportPath}`);
}

main().catch(console.error);
