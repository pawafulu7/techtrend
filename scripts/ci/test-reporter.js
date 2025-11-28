#!/usr/bin/env node

/**
 * Test Reporter - Jest実行結果からスキップを除外した成功率を計算
 * 
 * 使用方法:
 * npm test 2>&1 | node scripts/test-reporter.js
 * または
 * node scripts/test-reporter.js test-results.txt
 */

const fs = require('fs');
const readline = require('readline');

class TestReporter {
  constructor() {
    this.results = {
      suites: { total: 0, passed: 0, failed: 0, skipped: 0 },
      tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      startTime: Date.now(),
      endTime: null,
    };
  }

  /**
   * テスト結果を解析
   */
  parseLine(line) {
    // Test Suites の結果を解析
    const suitesMatch = line.match(/Test Suites:\s*(?:(\d+) skipped,\s*)?(?:(\d+) failed,\s*)?(\d+) passed,\s*(\d+)(?:\s+of\s+(\d+))?\s+total/);
    if (suitesMatch) {
      this.results.suites.skipped = parseInt(suitesMatch[1] || '0');
      this.results.suites.failed = parseInt(suitesMatch[2] || '0');
      this.results.suites.passed = parseInt(suitesMatch[3] || '0');
      this.results.suites.total = parseInt(suitesMatch[5] || suitesMatch[4]);
    }

    // Tests の結果を解析
    const testsMatch = line.match(/Tests:\s*(?:(\d+) skipped,\s*)?(?:(\d+) failed,\s*)?(\d+) passed,\s*(\d+)\s+total/);
    if (testsMatch) {
      this.results.tests.skipped = parseInt(testsMatch[1] || '0');
      this.results.tests.failed = parseInt(testsMatch[2] || '0');
      this.results.tests.passed = parseInt(testsMatch[3] || '0');
      this.results.tests.total = parseInt(testsMatch[4]);
    }

    // 実行時間を解析
    const timeMatch = line.match(/Time:\s*([\d.]+)\s*s/);
    if (timeMatch) {
      this.results.executionTime = parseFloat(timeMatch[1]);
    }
  }

  /**
   * 成功率を計算（スキップを除外）
   */
  calculateSuccessRate(passed, total, skipped) {
    const actualTotal = total - skipped;
    if (actualTotal === 0) return 0;
    return ((passed / actualTotal) * 100).toFixed(2);
  }

  /**
   * 結果を表示
   */
  displayResults() {
    console.log('\n' + '='.repeat(80));
    console.log('                        TEST RESULTS SUMMARY');
    console.log('='.repeat(80));

    // Test Suites
    console.log('\n📦 TEST SUITES:');
    console.log('─'.repeat(40));
    const suitesTotal = this.results.suites.total - this.results.suites.skipped;
    const suitesRate = this.calculateSuccessRate(
      this.results.suites.passed,
      this.results.suites.total,
      this.results.suites.skipped
    );
    
    console.log(`  Total:        ${this.results.suites.total}`);
    console.log(`  Passed:       ${this.results.suites.passed} ✅`);
    console.log(`  Failed:       ${this.results.suites.failed} ${this.results.suites.failed > 0 ? '❌' : ''}`);
    console.log(`  Skipped:      ${this.results.suites.skipped} ⏭️`);
    console.log('─'.repeat(40));
    console.log(`  Executed:     ${suitesTotal} (excluding skipped)`);
    console.log(`  Success Rate: ${suitesRate}% ${suitesRate === '100.00' ? '🎉' : ''}`);

    // Tests
    console.log('\n🧪 INDIVIDUAL TESTS:');
    console.log('─'.repeat(40));
    const testsTotal = this.results.tests.total - this.results.tests.skipped;
    const testsRate = this.calculateSuccessRate(
      this.results.tests.passed,
      this.results.tests.total,
      this.results.tests.skipped
    );
    
    console.log(`  Total:        ${this.results.tests.total}`);
    console.log(`  Passed:       ${this.results.tests.passed} ✅`);
    console.log(`  Failed:       ${this.results.tests.failed} ${this.results.tests.failed > 0 ? '❌' : ''}`);
    console.log(`  Skipped:      ${this.results.tests.skipped} ⏭️`);
    console.log('─'.repeat(40));
    console.log(`  Executed:     ${testsTotal} (excluding skipped)`);
    console.log(`  Success Rate: ${testsRate}% ${testsRate === '100.00' ? '🎉' : ''}`);

    // 実行時間
    if (this.results.executionTime) {
      console.log('\n⏱️  EXECUTION TIME:');
      console.log('─'.repeat(40));
      console.log(`  ${this.results.executionTime.toFixed(3)} seconds`);
    }

    // 総合判定
    console.log('\n📊 OVERALL STATUS:');
    console.log('─'.repeat(40));
    
    if (testsRate === '100.00' && suitesRate === '100.00') {
      console.log('  ✨ PERFECT! All tests passed (excluding skipped)');
    } else if (this.results.tests.failed === 0 && this.results.suites.failed === 0) {
      console.log('  ✅ SUCCESS! All executed tests passed');
    } else {
      console.log(`  ⚠️  ATTENTION NEEDED: ${this.results.tests.failed} test(s) failed`);
    }

    // スキップに関する注記
    if (this.results.tests.skipped > 0) {
      console.log('\n📝 NOTE:');
      console.log(`  ${this.results.tests.skipped} tests were intentionally skipped`);
      console.log('  (e.g., unimplemented features, environment-specific tests)');
      console.log('  These are excluded from the success rate calculation.');
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * ファイルから読み込んで処理
   */
  async processFile(filename) {
    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      this.parseLine(line);
    }

    this.displayResults();
  }

  /**
   * 標準入力から読み込んで処理
   */
  async processStdin() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // 入力をバッファリング
    const lines = [];
    rl.on('line', (line) => {
      lines.push(line);
      this.parseLine(line);
      // 元の出力もそのまま表示
      console.log(line);
    });

    rl.on('close', () => {
      this.displayResults();
    });
  }
}

// メイン処理
async function main() {
  const reporter = new TestReporter();

  if (process.argv.length > 2) {
    // ファイルから読み込み
    const filename = process.argv[2];
    if (!fs.existsSync(filename)) {
      console.error(`Error: File '${filename}' not found`);
      process.exit(1);
    }
    await reporter.processFile(filename);
  } else {
    // 標準入力から読み込み
    await reporter.processStdin();
  }
}

// 実行
main().catch(console.error);