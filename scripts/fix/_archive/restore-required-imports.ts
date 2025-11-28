#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { globSync } from 'glob';
import * as path from 'path';

console.log('🔧 必要なimportを復元中...\n');

// 修正が必要なファイルを取得
const files = globSync('app/**/*.{ts,tsx}', { 
  ignore: ['**/node_modules/**', '**/.next/**'] 
});

let fixedCount = 0;

files.forEach(file => {
  const filePath = path.resolve(file);
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const changes: string[] = [];
  
  // ESLintでこのファイルのエラーをチェック
  let errors: string[] = [];
  try {
    const result = execSync(`npx eslint ${file} 2>&1`, { encoding: 'utf-8' });
  } catch (error: any) {
    if (error.stdout) {
      errors = error.stdout.split('\n');
    }
  }
  
  // "is not defined"エラーを探す
  const undefinedComponents = new Set<string>();
  errors.forEach(line => {
    const match = line.match(/'(\w+)' is not defined/);
    if (match) {
      undefinedComponents.add(match[1]);
    }
  });
  
  if (undefinedComponents.size === 0) return;
  
  // 必要なimportを追加
  const importsToAdd: string[] = [];
  
  // UIコンポーネント
  const uiComponents = ['Button', 'CardHeader', 'CardTitle', 'CardDescription', 
    'TabsList', 'TabsTrigger', 'TabsContent', 'Tabs'];
  const neededUIComponents = uiComponents.filter(c => undefinedComponents.has(c));
  
  if (neededUIComponents.includes('Button')) {
    // Buttonのimportがない場合追加
    if (!content.includes("from '@/components/ui/button'") && 
        !content.includes('from "@/components/ui/button"')) {
      importsToAdd.push("import { Button } from '@/components/ui/button';");
      changes.push('Button import追加');
    }
  }
  
  // Card関連
  const cardComponents = neededUIComponents.filter(c => 
    ['CardHeader', 'CardTitle', 'CardDescription'].includes(c)
  );
  if (cardComponents.length > 0) {
    // 既存のCard importを拡張
    const cardImportMatch = content.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]@\/components\/ui\/card['"]/);
    if (cardImportMatch) {
      const existingImports = cardImportMatch[1].split(',').map(s => s.trim());
      const allCardImports = [...new Set([...existingImports, ...cardComponents])];
      const newImport = `import { ${allCardImports.join(', ')} } from '@/components/ui/card'`;
      content = content.replace(cardImportMatch[0], newImport);
      changes.push('Card imports更新');
    }
  }
  
  // Tabs関連
  const tabComponents = neededUIComponents.filter(c => 
    ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'].includes(c)
  );
  if (tabComponents.length > 0) {
    if (!content.includes("from '@/components/ui/tabs'")) {
      importsToAdd.push(`import { ${tabComponents.join(', ')} } from '@/components/ui/tabs';`);
      changes.push('Tabs imports追加');
    }
  }
  
  // Link
  if (undefinedComponents.has('Link')) {
    if (!content.includes("import Link from 'next/link'")) {
      importsToAdd.push("import Link from 'next/link';");
      changes.push('Link import追加');
    }
  }
  
  // Image
  if (undefinedComponents.has('Image')) {
    if (!content.includes("import Image from 'next/image'")) {
      importsToAdd.push("import Image from 'next/image';");
      changes.push('Image import追加');
    }
  }
  
  // importsを追加
  if (importsToAdd.length > 0) {
    // 最初のimport文の後に追加
    const firstImportMatch = content.match(/^import\s+.*$/m);
    if (firstImportMatch) {
      const insertPosition = content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
      content = content.slice(0, insertPosition) + '\n' + 
                importsToAdd.join('\n') + 
                content.slice(insertPosition);
    }
  }
  
  if (content !== originalContent) {
    writeFileSync(filePath, content);
    console.log(`✅ ${file}`);
    changes.forEach(change => console.log(`   - ${change}`));
    fixedCount++;
  }
});

console.log(`\n✨ ${fixedCount}ファイルのimportを復元しました`);

if (fixedCount > 0) {
  console.log('\n次のステップ:');
  console.log('1. npm run lint でエラーが減ったことを確認');
  console.log('2. npm test でテストが通ることを確認');
}