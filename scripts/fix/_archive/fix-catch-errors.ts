import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

/**
 * Fix catch block error variables by adding underscore prefix
 * This script addresses ESLint @typescript-eslint/no-unused-vars errors
 */

const targetPatterns = [
  'app/**/*.tsx',
  'app/**/*.ts',
  'lib/**/*.ts',
  'lib/**/*.tsx'
];

const fixCatchErrors = () => {
  console.log('Starting catch error variable fix...\n');
  
  let totalFilesProcessed = 0;
  let totalFilesFixed = 0;
  let totalReplacementsCount = 0;
  const fixedFiles: string[] = [];

  targetPatterns.forEach(pattern => {
    const files = globSync(pattern, {
      ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']
    });

    files.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const originalContent = content;
        
        // Pattern to match catch blocks with error, err, or e variables
        // This regex captures the entire catch block pattern
        const modifiedContent = content.replace(
          /catch\s*\(\s*(error|err|e)\s*\)/g,
          'catch (_error)'
        );
        
        if (modifiedContent !== originalContent) {
          fs.writeFileSync(file, modifiedContent);
          const replacementsCount = (originalContent.match(/catch\s*\(\s*(error|err|e)\s*\)/g) || []).length;
          console.log(`✓ Fixed: ${file} (${replacementsCount} replacement${replacementsCount > 1 ? 's' : ''})`);
          fixedFiles.push(file);
          totalFilesFixed++;
          totalReplacementsCount += replacementsCount;
        }
        
        totalFilesProcessed++;
      } catch (error) {
        console.error(`✗ Error processing ${file}:`, error);
      }
    });
  });

  console.log('\n========================================');
  console.log('Fix Catch Errors - Summary');
  console.log('========================================');
  console.log(`Total files processed: ${totalFilesProcessed}`);
  console.log(`Total files fixed: ${totalFilesFixed}`);
  console.log(`Total replacements: ${totalReplacementsCount}`);
  
  if (fixedFiles.length > 0) {
    console.log('\nFixed files:');
    fixedFiles.forEach(file => console.log(`  - ${file}`));
  }
  
  console.log('\n✓ Catch error variable fix completed successfully!');
};

// Execute the fix
fixCatchErrors();