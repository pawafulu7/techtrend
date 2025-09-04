#!/usr/bin/env npx tsx
/**
 * generate-summaries.tsの修正確認テスト
 */

// removeMarkdownBold関数の動作確認
function removeMarkdownBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

console.log("=== generate-summaries.ts修正確認テスト ===\n");

// テストケース
const testCases = [
  {
    name: "箇条書きのMarkdown太字",
    input: "・**問題点の提示と改善策：** 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し",
    expected: "・問題点の提示と改善策： 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し"
  },
  {
    name: "複数のMarkdown太字",
    input: "・**Discriminated Unionsによる状態管理の改善：**  `ParseResult`型をDiscriminated Unionsとして定義",
    expected: "・Discriminated Unionsによる状態管理の改善：  `ParseResult`型をDiscriminated Unionsとして定義"
  },
  {
    name: "コロンなしのパターン",
    input: "・**まとめと結論** 本記事では、TypeScriptの高度な型システムを活用",
    expected: "・まとめと結論 本記事では、TypeScriptの高度な型システムを活用"
  },
  {
    name: "通常のテキスト内のMarkdown",
    input: "本記事では、**TypeScript**の高度な**型システム**を活用",
    expected: "本記事では、TypeScriptの高度な型システムを活用"
  }
];

console.log("個別テスト結果:");
testCases.forEach((testCase, index) => {
  const result = removeMarkdownBold(testCase.input);
  const isPass = result === testCase.expected;
  
  console.log(`\nテスト${index + 1}: ${testCase.name}`);
  console.log(`入力: ${testCase.input}`);
  console.log(`出力: ${result}`);
  console.log(`結果: ${isPass ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!isPass) {
    console.log(`期待: ${testCase.expected}`);
  }
});

// 実際のparseSummaryAndTags関数のシミュレーション
console.log("\n\n=== 実際の処理シミュレーション ===\n");

const apiResponse = `要約: TypeScriptの型安全性向上に関する技術記事。CSVパーサー実装を例に、高度な型定義機能を解説。

詳細要約:
・**問題点の提示と改善策：** 記事は、従来のJSによるCSVパーサー実装における型安全性の欠如という問題点を指摘し、TypeScriptの高度な型定義機能を用いた改善策を提案している。
・**Discriminated Unionsによる状態管理の改善：**  ParseResult型をDiscriminated Unionsとして定義することで、idle, parsing, success, errorといった状態を明確に表現。
・**Type Guardsによる型絞り込みと簡潔なコード：**  isParseSuccessやisParseErrorといったType Guards関数を定義。
・**まとめと結論** 本記事では、TypeScriptの高度な型システムを活用することで、CSVパーサーの実装における型安全性を大幅に向上させた。

タグ: TypeScript, 型安全性, CSVパーサー, Discriminated Unions, Type Guards`;

// 簡易パーサー
function parseDetailedSummarySimulation(text: string): string {
  const lines = text.split('\n');
  let detailedSummary = '';
  let isDetailedSummary = false;
  
  for (const line of lines) {
    if (line.match(/^詳細要約[:：]/)) {
      isDetailedSummary = true;
    } else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      if (line.trim().startsWith('・')) {
        const cleanedLine = removeMarkdownBold(line.trim());
        if (detailedSummary) {
          detailedSummary += '\n' + cleanedLine;
        } else {
          detailedSummary = cleanedLine;
        }
      } else if (!line.match(/^要約[:：]/)) {
        const cleanedLine = line.trim();
        if (detailedSummary) {
          detailedSummary += '\n' + cleanedLine;
        } else {
          detailedSummary = cleanedLine;
        }
      }
    } else if (line.match(/^タグ[:：]/)) {
      isDetailedSummary = false;
    }
  }
  
  return detailedSummary;
}

const parsedDetailedSummary = parseDetailedSummarySimulation(apiResponse);

console.log("APIレスポンス（詳細要約部分）:");
console.log("----------------------------------------");
const detailedLines = apiResponse.split('\n').filter(line => 
  line.includes('・**') || line.includes('詳細要約')
);
detailedLines.forEach(line => console.log(line));

console.log("\n\n処理後の詳細要約:");
console.log("----------------------------------------");
console.log(parsedDetailedSummary);

console.log("\n\n確認項目:");
console.log("----------------------------------------");
console.log(`1. Markdown太字(**) が含まれているか: ${parsedDetailedSummary.includes('**') ? '❌ 含まれている' : '✅ 含まれていない'}`);
console.log(`2. 箇条書きが保持されているか: ${parsedDetailedSummary.includes('・') ? '✅ 保持されている' : '❌ 失われている'}`);
console.log(`3. コロン(:)が保持されているか: ${parsedDetailedSummary.includes('：') ? '✅ 保持されている' : '❌ 失われている'}`);