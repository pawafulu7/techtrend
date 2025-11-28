#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * TS7006エラー（implicit any）を自動修正
 */

// TypeScriptエラーを取得
const errors = execSync('npx tsc --noEmit 2>&1 | grep "TS7006" || true', { encoding: 'utf-8' });
const errorLines = errors.split('\n').filter(line => line.includes('TS7006'));

// エラーをファイルごとにグループ化
const errorsByFile = new Map<string, Array<{line: number, column: number, parameter: string}>>();

errorLines.forEach(errorLine => {
  const match = errorLine.match(/^(.+?):(\d+):(\d+).*Parameter '(.+?)' implicitly/);
  if (match) {
    const [, file, line, column, parameter] = match;
    if (!errorsByFile.has(file)) {
      errorsByFile.set(file, []);
    }
    errorsByFile.get(file)!.push({
      line: parseInt(line),
      column: parseInt(column),
      parameter
    });
  }
});

console.log(`Found ${errorsByFile.size} files with TS7006 errors`);

// 各ファイルを修正
errorsByFile.forEach((errors, filePath) => {
  console.log(`\nFixing ${filePath}...`);
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // エラーを行番号の降順でソート（後ろから修正）
    errors.sort((a, b) => b.line - a.line);
    
    errors.forEach(error => {
      const lineIndex = error.line - 1;
      const line = lines[lineIndex];
      
      if (line) {
        // パラメータに型を追加
        const patterns = [
          // .forEach((param) => ...)
          new RegExp(`\\.forEach\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.forEach\\(\\((${error.parameter}),`, 'g'),
          
          // .map((param) => ...)
          new RegExp(`\\.map\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.map\\(\\((${error.parameter}),`, 'g'),
          
          // .filter((param) => ...)
          new RegExp(`\\.filter\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.filter\\(\\((${error.parameter}),`, 'g'),
          
          // .find((param) => ...)
          new RegExp(`\\.find\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.find\\(\\((${error.parameter}),`, 'g'),
          
          // .some((param) => ...)
          new RegExp(`\\.some\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.some\\(\\((${error.parameter}),`, 'g'),
          
          // .findIndex((param) => ...)
          new RegExp(`\\.findIndex\\(\\((${error.parameter})\\)`, 'g'),
          new RegExp(`\\.findIndex\\(\\((${error.parameter}),`, 'g'),
          
          // async (param) => ...
          new RegExp(`async \\((${error.parameter})\\)`, 'g'),
          new RegExp(`async \\((${error.parameter}),`, 'g'),
          
          // } catch (error) {
          new RegExp(`catch \\((${error.parameter})\\)`, 'g'),
        ];
        
        let fixed = false;
        let newLine = line;
        
        // 各パターンを試す
        for (const pattern of patterns) {
          if (pattern.test(line)) {
            // インデックス系は number、それ以外は any
            let type = 'any';
            if (error.parameter === 'index' || error.parameter === 'i') {
              type = 'number';
            } else if (error.parameter === 'error' || error.parameter === 'e') {
              type = 'any';
            }
            
            // 型を追加
            if (line.includes(`(${error.parameter}),`)) {
              newLine = line.replace(new RegExp(`\\((${error.parameter}),`, 'g'), `(${error.parameter}: ${type},`);
            } else if (line.includes(`(${error.parameter})`)) {
              newLine = line.replace(new RegExp(`\\((${error.parameter})\\)`, 'g'), `(${error.parameter}: ${type})`);
            }
            
            fixed = true;
            break;
          }
        }
        
        // パターンに一致しない場合は単純に : any を追加
        if (!fixed && line.includes(error.parameter)) {
          // 関数パラメータの場合
          const funcParamPattern = new RegExp(`(\\(|,)\\s*(${error.parameter})(\\s*[,\\)])`, 'g');
          if (funcParamPattern.test(line)) {
            newLine = line.replace(funcParamPattern, `$1 $2: any$3`);
            fixed = true;
          }
        }
        
        if (fixed) {
          lines[lineIndex] = newLine;
          console.log(`  Fixed line ${error.line}: ${error.parameter} -> ${error.parameter}: any`);
        }
      }
    });
    
    // ファイルを保存
    writeFileSync(filePath, lines.join('\n'));
    console.log(`  Saved ${filePath}`);
    
  } catch (err) {
    console.error(`  Error fixing ${filePath}:`, err);
  }
});

console.log('\n✅ TS7006 error fixing complete!');

// 結果を確認
const remainingErrors = execSync('npx tsc --noEmit 2>&1 | grep -c "TS7006" || echo "0"', { encoding: 'utf-8' });
console.log(`\nRemaining TS7006 errors: ${remainingErrors.trim()}`);