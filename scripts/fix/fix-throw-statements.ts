#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

const targetPatterns = [
  'app/**/*.tsx',
  'app/**/*.ts', 
  'lib/**/*.ts',
  'lib/**/*.tsx',
  'scripts/**/*.ts',
  '!**/*.test.ts',
  '!**/*.test.tsx',
  '!**/__tests__/**',
  '!**/__mocks__/**'
];

const fixThrowStatements = () => {
  console.log('Starting throw statement fixes...');
  
  const files = globSync(targetPatterns);
  let totalFixed = 0;
  let filesFixed = 0;
  const fixedFiles: string[] = [];

  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    const originalContent = content;
    let localFixes = 0;
    
    // Pattern 1: catch (_error) { ... throw _error ... }
    // This regex looks for catch blocks with _error and fixes throw statements inside them
    const catchBlockRegex = /catch\s*\(\s*_error\s*\)\s*\{([^}]*)\}/g;
    
    content = content.replace(catchBlockRegex, (match, blockContent) => {
      const fixedBlock = blockContent.replace(/throw\s+error\b/g, 'throw _error');
      if (fixedBlock !== blockContent) {
        localFixes++;
      }
      return `catch (_error) {${fixedBlock}}`;
    });
    
    // Pattern 2: Fix cases where error is used in nested blocks after catch (_error)
    // This handles cases like: catch (_error) { if (...) { throw _error } }
    const lines = content.split('\n');
    let inCatchBlock = false;
    let catchVarName = '';
    let braceDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect catch block start with _error
      const catchMatch = line.match(/catch\s*\(\s*(_\w+)\s*\)/);
      if (catchMatch) {
        inCatchBlock = true;
        catchVarName = catchMatch[1];
        braceDepth = 0;
      }
      
      if (inCatchBlock) {
        // Count braces to track when we exit the catch block
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') {
            braceDepth--;
            if (braceDepth === 0) {
              inCatchBlock = false;
              catchVarName = '';
            }
          }
        }
        
        // Fix throw statements in this line if we're in a catch block with _error
        if (catchVarName && catchVarName.startsWith('_')) {
          const throwRegex = new RegExp(`throw\\s+${catchVarName.substring(1)}\\b`, 'g');
          const fixedLine = lines[i].replace(throwRegex, `throw ${catchVarName}`);
          if (fixedLine !== lines[i]) {
            lines[i] = fixedLine;
            localFixes++;
          }
        }
      }
    }
    
    content = lines.join('\n');
    
    if (content !== originalContent) {
      fs.writeFileSync(file, content);
      console.log(`Fixed ${localFixes} throw statement(s) in: ${file}`);
      totalFixed += localFixes;
      filesFixed++;
      fixedFiles.push(file);
    }
  });
  
  console.log('\n=== Summary ===');
  console.log(`Total files scanned: ${files.length}`);
  console.log(`Files fixed: ${filesFixed}`);
  console.log(`Total throw statements fixed: ${totalFixed}`);
  
  if (fixedFiles.length > 0) {
    console.log('\nFixed files:');
    fixedFiles.forEach(file => console.log(`  - ${file}`));
  }
};

// Run the fix
fixThrowStatements();