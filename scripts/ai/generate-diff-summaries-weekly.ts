#!/usr/bin/env npx tsx
/**
 * Weekly Diff Summary Generator Wrapper
 *
 * Automatically calculates the previous ISO week and generates diff summaries.
 * Intended to be run on Monday mornings to summarize the previous week.
 *
 * Usage:
 *   npx tsx scripts/ai/generate-diff-summaries-weekly.ts
 *   npx tsx scripts/ai/generate-diff-summaries-weekly.ts --dry-run
 */

import { getISOWeek, getISOWeekYear } from 'date-fns';
import { spawn } from 'child_process';
import * as path from 'path';

function getPreviousISOWeek(): string {
  // Get last Sunday's date (end of previous week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));

  const weekNum = getISOWeek(lastSunday);
  const year = getISOWeekYear(lastSunday);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

async function main() {
  const targetWeek = getPreviousISOWeek();
  const isDryRun = process.argv.includes('--dry-run');

  console.log('=== Weekly Diff Summary Generator ===');
  console.log(`Target week: ${targetWeek}`);
  console.log(`Dry run: ${isDryRun}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  const args = [
    'tsx',
    path.join(__dirname, 'generate-diff-summaries.ts'),
    '--week',
    targetWeek,
    '--force',
  ];

  if (isDryRun) {
    args.push('--dry-run');
  }

  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
  });

  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        console.log('');
        console.log('=== Generation completed successfully ===');
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('Failed to generate diff summaries:', err);
  process.exit(1);
});
