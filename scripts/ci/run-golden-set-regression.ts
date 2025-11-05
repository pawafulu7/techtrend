import { writeFile } from 'fs/promises';
import { GoldenSetRegressionTester } from '@/lib/ai/testing/regression-tester';

async function main() {
  const concurrency = parseInt(process.env.REGRESSION_CONCURRENCY || '5', 10);
  const timeout = parseInt(process.env.REGRESSION_TIMEOUT || '60000', 10);
  const limit = process.env.REGRESSION_LIMIT
    ? parseInt(process.env.REGRESSION_LIMIT, 10)
    : undefined;

  const tester = new GoldenSetRegressionTester({
    parallel: process.env.CI === 'true',
    concurrency,
    timeout,
    limit,
  });

  console.log('='.repeat(72));
  console.log('AI Golden Set Regression Test');
  console.log('='.repeat(72));
  console.log('');

  const report = await tester.runRegression();

  const markdownReport = tester.generateMarkdownReport(report);
  console.log('\n' + markdownReport);

  await writeFile('regression-report.json', JSON.stringify(report, null, 2));
  await writeFile('regression-report.md', markdownReport);

  console.log('\nReports saved:');
  console.log('  - regression-report.json');
  console.log('  - regression-report.md');

  if (report.passRate < 95.0) {
    console.error(
      `\nERROR: Regression test failed. Pass rate: ${report.passRate.toFixed(1)}% < 95.0%`
    );
    process.exit(1);
  }

  console.log(`\nSUCCESS: Regression test passed (${report.passRate.toFixed(1)}%)`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
