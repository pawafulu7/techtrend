import { writeFile } from 'fs/promises';
import { GoldenSetRegressionTester, RegressionAbortedError } from '@/lib/ai/testing/regression-tester';

async function main() {
  const regressionMode = process.env.REGRESSION_MODE === 'true';
  const baseConcurrency = parseInt(process.env.REGRESSION_CONCURRENCY || '5', 10);
  const timeout = parseInt(process.env.REGRESSION_TIMEOUT || '60000', 10);
  const limit = process.env.REGRESSION_LIMIT
    ? parseInt(process.env.REGRESSION_LIMIT, 10)
    : undefined;

  const parallel = regressionMode ? false : process.env.CI === 'true';
  const concurrency = regressionMode ? 1 : baseConcurrency;

  console.log(
    `[GoldenSetRegression] Mode: ${
      regressionMode ? 'serial regression (REGRESSION_MODE=true)' : 'default'
    } | parallel=${parallel} | concurrency=${concurrency}`,
  );

  const tester = new GoldenSetRegressionTester({
    parallel,
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

main().catch(async (error) => {
  if (error instanceof RegressionAbortedError) {
    // ワークフローは失敗時に regression-report.md を PR のコメントに載せるので、止めた理由を書いておく
    const markdown = `## Regression test aborted\n\n${error.message}\n`;
    await writeFile('regression-report.md', markdown);
    await writeFile('regression-report.json', JSON.stringify({ aborted: true, reason: error.message }, null, 2));
    console.error(`\nERROR: ${error.message}`);
    process.exit(1);
  }
  console.error('Fatal error:', error);
  process.exit(1);
});
