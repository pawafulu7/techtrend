#!/usr/bin/env -S tsx
/**
 * Markdown太字記法削除の正規表現テストスクリプト
 */

// 実際の問題のあるテキスト
const testCases = [
  {
    name: "実際の問題パターン（・**項目名:**）",
    input: "・**問題点の提示と改善策：** 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し",
    expected: "・問題点の提示と改善策： 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し"
  },
  {
    name: "複数のMarkdownパターン",
    input: "・**Discriminated Unionsによる状態管理の改善：**  `ParseResult`型をDiscriminated Unionsとして定義",
    expected: "・Discriminated Unionsによる状態管理の改善：  `ParseResult`型をDiscriminated Unionsとして定義"
  },
  {
    name: "中間にある太字",
    input: "本記事では、**TypeScript**の高度な型システムを活用",
    expected: "本記事では、TypeScriptの高度な型システムを活用"
  },
  {
    name: "コロンなしのパターン",
    input: "・**まとめと結論** 本記事では、TypeScriptの高度な型システムを活用",
    expected: "・まとめと結論 本記事では、TypeScriptの高度な型システムを活用"
  }
];

console.log("=== Markdown太字記法削除テスト ===\n");

// 現在のパーサーの正規表現
const currentRegex = /\*\*([^*]+)\*\*/g;

console.log("現在の正規表現: /\\*\\*([^*]+)\\*\\*/g\n");

testCases.forEach((testCase, index) => {
  console.log(`テスト${index + 1}: ${testCase.name}`);
  console.log(`入力: ${testCase.input}`);
  
  // 現在の正規表現で置換
  const result = testCase.input.replace(currentRegex, '$1');
  console.log(`出力: ${result}`);
  console.log(`期待: ${testCase.expected}`);
  
  const isPass = result === testCase.expected;
  console.log(`結果: ${isPass ? '✅ PASS' : '❌ FAIL'}\n`);
});

// 改善案の正規表現テスト
console.log("=== 改善案のテスト ===\n");

// より具体的なパターン用の追加正規表現
const improvedPatterns = [
  {
    name: "改善案1: 「・**」で始まるパターンを特別処理",
    regex: /・\*\*([^*:]+)(?:：|\:)\*\*/g,
    replacement: '・$1：'
  },
  {
    name: "改善案2: すべての**を削除（2段階処理）",
    process: (text: string) => {
      // まず「・**項目:**」形式を処理
      let result = text.replace(/・\*\*([^*]+):\*\*/g, '・$1:');
      // 次に「・**項目：**」形式（全角コロン）を処理
      result = result.replace(/・\*\*([^*]+)：\*\*/g, '・$1：');
      // 残りのすべての太字を削除
      result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
      return result;
    }
  }
];

console.log("改善案2のテスト（2段階処理）:");
testCases.forEach((testCase, index) => {
  const result = improvedPatterns[1].process(testCase.input);
  const isPass = result === testCase.expected;
  console.log(`テスト${index + 1}: ${isPass ? '✅' : '❌'} ${testCase.name}`);
  if (!isPass) {
    console.log(`  結果: ${result}`);
    console.log(`  期待: ${testCase.expected}`);
  }
});

// 実際のcleanupDetailedSummary関数のシミュレーション
function cleanupDetailedSummarySimulation(text: string): string {
  const lines = text.split('\n');
  return lines.map(line => {
    let cleanedLine = line.trim();
    
    // Markdown太字記法を削除（現在の実装）
    cleanedLine = cleanedLine.replace(/\*\*([^*]+)\*\*/g, '$1');
    
    return cleanedLine;
  }).filter(line => line.length > 0).join('\n');
}

console.log("\n=== 実際の関数のシミュレーション ===\n");
const multilineTest = `・**問題点の提示と改善策：** 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し、TypeScriptの高度な型定義機能を用いた改善策を提案している。
・**Discriminated Unionsによる状態管理の改善：**  ParseResult型をDiscriminated Unionsとして定義することで、状態を明確に表現`;

console.log("複数行のテスト:");
console.log("入力:\n" + multilineTest);
console.log("\n出力:\n" + cleanupDetailedSummarySimulation(multilineTest));