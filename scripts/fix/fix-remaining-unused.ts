#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';

console.log('🔍 残りの未使用変数・importの修正を開始...\n');

// ESLintでエラーを取得
const eslintOutput = execSync(
  'npx eslint app lib components scripts --ignore-pattern ".next" --ignore-pattern "node_modules" --format json',
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
);

let results;
try {
  results = JSON.parse(eslintOutput);
} catch (error) {
  console.error('ESLint出力の解析に失敗しました');
  process.exit(1);
}

const fixedFiles = new Map<string, Set<string>>();
let totalFixes = 0;

// ファイルごとにエラーを処理
results.forEach((file: any) => {
  if (!file.messages || file.messages.length === 0) return;
  
  const filePath = file.filePath;
  const relativePath = path.relative(process.cwd(), filePath);
  
  // ソースコード以外はスキップ
  if (!relativePath.match(/^(app|lib|components|scripts)\//)) return;
  
  const unusedErrors = file.messages.filter((msg: any) => 
    msg.ruleId === '@typescript-eslint/no-unused-vars' &&
    (msg.message.includes('is defined but never used') || 
     msg.message.includes('is assigned a value but never used'))
  );
  
  if (unusedErrors.length === 0) return;
  
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const fixes = new Set<string>();
  
  unusedErrors.forEach((error: any) => {
    const varName = error.message.match(/'([^']+)'/)?.[1];
    if (!varName) return;
    
    // 削除可能な変数パターン
    const deletePatterns = [
      'totalCount', 'hasLoadedInitial', 'isTransitioning', 
      'getMetricLabel', 'getPeriodLabel', 'totalHeight',
      'scrollY', 'duration'
    ];
    
    if (deletePatterns.includes(varName)) {
      // 変数宣言を削除
      const patterns = [
        // const/let/var 変数 = 値;
        new RegExp(`^\\s*(const|let|var)\\s+${varName}\\s*=.*?;\\s*$`, 'gm'),
        // 分割代入の一部: const { x, varName, y } = obj;
        new RegExp(`(,\\s*)?${varName}(\\s*,)?`, 'g'),
        // 状態フック: const [varName, setVarName] = useState
        new RegExp(`^\\s*const\\s*\\[\\s*${varName}\\s*,\\s*set\\w+\\s*\\]\\s*=\\s*useState.*?;\\s*$`, 'gm')
      ];
      
      patterns.forEach(pattern => {
        if (pattern.test(content)) {
          content = content.replace(pattern, (match, ...args) => {
            // 分割代入の場合はカンマの処理
            if (match.includes(',')) {
              return match.replace(new RegExp(`(,\\s*)?${varName}(\\s*,)?`), (m, before, after) => {
                if (before && after) return ','; // 中間の要素
                return ''; // 最初または最後の要素
              });
            }
            return '';
          });
          fixes.add(`削除: ${varName}`);
        }
      });
    } else {
      // _プレフィックス追加（session、エラー変数など）
      const prefixPatterns = ['session', 'error', 'err'];
      
      if (prefixPatterns.some(p => varName === p || varName.includes(p))) {
        // 変数名に_プレフィックスを追加
        const patterns = [
          // const session = ...
          new RegExp(`(const|let|var)\\s+${varName}\\s*=`, 'g'),
          // const { session } = ...
          new RegExp(`{([^}]*)(\\s*)${varName}(\\s*)([^}]*)}`, 'g'),
          // catch (error)
          new RegExp(`catch\\s*\\(\\s*${varName}\\s*\\)`, 'g')
        ];
        
        patterns.forEach(pattern => {
          if (pattern.test(content)) {
            if (varName === 'session') {
              // sessionの場合は分割代入を修正
              content = content.replace(
                new RegExp(`{([^}]*)(\\s*)${varName}(\\s*)([^}]*)}`, 'g'),
                `{$1$2${varName}: _${varName}$3$4}`
              );
            } else {
              content = content.replace(pattern, (match) => {
                return match.replace(varName, `_${varName}`);
              });
            }
            fixes.add(`_プレフィックス追加: ${varName} → _${varName}`);
          }
        });
      }
    }
  });
  
  if (content !== originalContent) {
    writeFileSync(filePath, content);
    fixedFiles.set(relativePath, fixes);
    totalFixes += fixes.size;
  }
});

// 結果表示
console.log('📊 修正結果:\n');
fixedFiles.forEach((fixes, file) => {
  console.log(`✅ ${file}`);
  fixes.forEach(fix => console.log(`   - ${fix}`));
});

console.log(`\n合計: ${fixedFiles.size}ファイル、${totalFixes}件の修正`);

if (totalFixes > 0) {
  console.log('\n✨ 未使用変数の修正が完了しました！');
  console.log('\n次のステップ:');
  console.log('1. npm run lint でエラーが減ったことを確認');
  console.log('2. npm test でテストが通ることを確認');
} else {
  console.log('\n修正可能な未使用変数は見つかりませんでした。');
}