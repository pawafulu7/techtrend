#!/usr/bin/env node
import { Command } from 'commander';
import { summariesCommand } from './commands/summaries';
import { qualityScoresCommand } from './commands/quality-scores';
import { cleanupCommand } from './commands/cleanup';
import { feedsCommand } from './commands/feeds';
import { tagsCommand } from './commands/tags';

const program = new Command();

program
  .name('techtrend')
  .description('TechTrend management CLI - 統合管理ツール')
  .version('1.0.0');

// サブコマンドの登録
program.addCommand(summariesCommand);
program.addCommand(qualityScoresCommand);
program.addCommand(cleanupCommand);
program.addCommand(feedsCommand);
program.addCommand(tagsCommand);

// エラーハンドリング
program.exitOverride();

try {
  program.parse();
} catch (err) {
  console.error('エラーが発生しました:', err);
  process.exit(1);
}