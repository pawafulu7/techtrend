/**
 * Trend Report Generator
 *
 * 日間トレンドレポートを生成するスケジュールスクリプト
 * GitHub Actionsから毎日1時（JST）に実行される
 *
 * Usage:
 *   npx tsx scripts/scheduled/generate-trend-report.ts [options]
 *
 * Options:
 *   --type daily|weekly|monthly  レポートタイプ（デフォルト: daily）
 *   --date YYYY-MM-DD            対象日付（オプション）
 */

import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report-generator';

type ReportType = 'daily' | 'weekly' | 'monthly';

function parseArgs(): { type: ReportType; date?: Date } {
  const args = process.argv.slice(2);
  let type: ReportType = 'daily';
  let date: Date | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      const t = args[i + 1].toLowerCase();
      if (t === 'daily' || t === 'weekly' || t === 'monthly') {
        type = t;
      }
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      const parsed = new Date(args[i + 1] + 'T00:00:00+09:00');
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
      i++;
    }
  }

  return { type, date };
}

async function main() {
  const { type, date: specifiedDate } = parseArgs();

  // デフォルトは前日（JST基準）
  let targetDate: Date;
  if (specifiedDate) {
    targetDate = specifiedDate;
  } else {
    // 前日を計算（JST基準）
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    jstNow.setUTCDate(jstNow.getUTCDate() - 1);
    jstNow.setUTCHours(0, 0, 0, 0);
    targetDate = new Date(jstNow.getTime() - jstOffset);
  }

  console.log('=== Trend Report Generation ===');
  console.log(`Type: ${type}`);
  console.log(`Target Date: ${targetDate.toISOString()} (${specifiedDate ? 'specified' : 'yesterday'})`);
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    const generator = new TrendReportGenerator(prisma);

    let reportId: string;

    switch (type) {
      case 'daily':
        reportId = await generator.generateDailyReport(targetDate);
        break;
      case 'weekly':
        reportId = await generator.generateWeeklyReport(targetDate);
        break;
      case 'monthly':
        reportId = await generator.generateMonthlyReport(targetDate);
        break;
    }

    console.log(`Successfully generated ${type} trend report: ${reportId}`);
    console.log(`Completed at: ${new Date().toISOString()}`);
  } catch (error) {
    console.error(`Failed to generate ${type} trend report:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
