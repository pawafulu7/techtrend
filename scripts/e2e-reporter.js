#!/usr/bin/env node

/**
 * E2E Test Reporter - Playwright実行結果から正確な成功率を計算
 * スキップ、did not runを除外した実質的な成功率を表示
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let testResults = {
  passed: 0,
  failed: 0,
  flaky: 0,
  skipped: 0,
  didNotRun: 0,
  timeout: false,
  timeElapsed: ''
};

rl.on('line', (line) => {
  // テスト結果のパターンを検出
  const passedMatch = line.match(/(\d+)\s+passed/);
  const failedMatch = line.match(/(\d+)\s+failed/);
  const flakyMatch = line.match(/(\d+)\s+flaky/);
  const skippedMatch = line.match(/(\d+)\s+skipped/);
  const didNotRunMatch = line.match(/(\d+)\s+did not run/);
  // "(3m 20s)" や "(245ms)" など括弧内の全表記を取得
  const timeMatch = line.match(/\(([^)]+)\)/);
  
  if (passedMatch) {
    testResults.passed = parseInt(passedMatch[1]);
  }
  if (failedMatch) {
    testResults.failed = parseInt(failedMatch[1]);
  }
  if (flakyMatch) {
    testResults.flaky = parseInt(flakyMatch[1]);
  }
  if (skippedMatch) {
    testResults.skipped = parseInt(skippedMatch[1]);
  }
  if (didNotRunMatch) {
    testResults.didNotRun = parseInt(didNotRunMatch[1]);
  }
  if (timeMatch) {
    testResults.timeElapsed = timeMatch[1];
  }
  // タイムアウト検出を広げる
  if (/Command timed out|Timed out|Timeout/i.test(line)) {
    testResults.timeout = true;
  }
  
  // 通常の出力も表示
  console.log(line);
});

rl.on('close', () => {
  // 最終的な成功率を計算して表示
  displaySummary();
});

function displaySummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 E2E TEST RESULTS SUMMARY (Excluding Skipped/Did Not Run)');
  console.log('='.repeat(80));
  
  const totalTests = testResults.passed + testResults.failed + testResults.flaky + 
                     testResults.skipped + testResults.didNotRun;
  const executedTests = testResults.passed + testResults.failed + testResults.flaky;
  const successfulTests = testResults.passed + testResults.flaky; // flakyは最終的に成功
  
  // 詳細表示
  console.log('\n📈 Test Breakdown:');
  console.log(`   Total Tests:        ${totalTests}`);
  console.log(`   ✅ Passed:          ${testResults.passed}`);
  console.log(`   ⚠️  Flaky:           ${testResults.flaky} (counted as success after retry)`);
  console.log(`   ❌ Failed:          ${testResults.failed}`);
  console.log(`   ⏭️  Skipped:         ${testResults.skipped}`);
  console.log(`   ⏸️  Did Not Run:     ${testResults.didNotRun}`);
  
  console.log('\n📊 Execution Metrics:');
  console.log(`   Executed Tests:     ${executedTests} (Total - Skipped - Did Not Run)`);
  console.log(`   Successful Tests:   ${successfulTests} (Passed + Flaky)`);
  
  // 成功率計算
  const successRateNum = executedTests > 0 
    ? ((successfulTests / executedTests) * 100)
    : 0;
  
  console.log('\n🎯 Success Rate (Excluding Non-Executed):');
  console.log(`   ${successRateNum.toFixed(2)}% (${successfulTests}/${executedTests})`);
  
  // ステータス評価
  let status = '';
  let emoji = '';
  
  if (testResults.timeout) {
    status = '⏱️  TIMEOUT - Tests did not complete within time limit';
    emoji = '⚠️';
  } else if (successRateNum === 100) {
    status = '✨ PERFECT! All executed tests passed!';
    emoji = '🎉';
  } else if (successRateNum >= 95) {
    status = '✅ EXCELLENT - Very high success rate';
    emoji = '👍';
  } else if (successRateNum >= 90) {
    status = '🔵 GOOD - Acceptable success rate';
    emoji = '👌';
  } else if (successRateNum >= 80) {
    status = '🟡 NEEDS ATTENTION - Some failures need fixing';
    emoji = '⚠️';
  } else {
    status = '🔴 CRITICAL - Many tests are failing';
    emoji = '🚨';
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`${emoji} Status: ${status}`);
  console.log('='.repeat(80));
  
  if (testResults.timeElapsed) {
    console.log(`\n⏱️  Time Elapsed: ${testResults.timeElapsed}`);
  }
  
  // 100%達成への道のり
  if (successRateNum < 100 && executedTests > 0) {
    const testsToFix = testResults.failed;
    console.log(`\n📌 To Achieve 100%: Fix ${testsToFix} failing test(s)`);
  }
  
  // CI/CD向けの終了コード
  if (testResults.failed > 0 || testResults.timeout) {
    process.exit(1);
  }
}