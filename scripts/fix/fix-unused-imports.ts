#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import * as path from 'path';

// 未使用import/変数を修正するスクリプト
const patterns = [
  'app/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}'
];

const ignorePatterns = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**'
];

console.log('🔍 未使用import/変数の修正を開始...\n');

// ファイルを取得
const files = patterns.flatMap(pattern => 
  globSync(pattern, { 
    ignore: ignorePatterns,
    cwd: process.cwd()
  })
);

console.log(`📁 対象ファイル数: ${files.length}\n`);

// 修正が必要なファイルと内容を記録
const fixedFiles: string[] = [];

files.forEach(file => {
  const filePath = path.resolve(file);
  let content = readFileSync(filePath, 'utf-8');
  let originalContent = content;
  let changes: string[] = [];

  // catch文のerrorを_errorに変更（まだ残っているもの）
  const catchPattern = /catch\s*\(\s*(?:error|err)\s*\)/g;
  if (catchPattern.test(content)) {
    content = content.replace(/catch\s*\(\s*error\s*\)/g, 'catch (_error)');
    content = content.replace(/catch\s*\(\s*err\s*\)/g, 'catch (_err)');
    changes.push('catch文のエラー変数を修正');
  }

  // 具体的な未使用importの削除パターン
  const unusedImports = [
    // app/components/home/filters.tsx
    { pattern: /import\s*{\s*getAllCategories\s*,\s*getSourceIdsByCategory\s*}\s*from\s*['"].*?['"]\s*;\s*\n/g, name: 'getAllCategories, getSourceIdsByCategory' },
    
    // app/components/article/infinite-article-list.tsx
    { pattern: /import\s*type\s*{\s*Tag\s*}\s*from\s*['"]@prisma\/client['"]\s*;\s*\n/g, name: 'Tag from @prisma/client' },
    
    // app/components/recommendations.tsx
    { pattern: /import\s*{\s*TabsContent\s*}\s*from\s*['"].*?['"]\s*;\s*\n/g, name: 'TabsContent' },
    { pattern: /import\s*{\s*TrendingDown\s*}\s*from\s*['"]lucide-react['"]\s*;\s*\n/g, name: 'TrendingDown' },
    
    // app/components/article/list.tsx
    { pattern: /import\s*{\s*SourceCategory\s*}\s*from\s*['"]@prisma\/client['"]\s*;\s*\n/g, name: 'SourceCategory' },
    
    // app/favorites/page-bkp.tsx
    { pattern: /import\s*{\s*cookies\s*}\s*from\s*['"]next\/headers['"]\s*;\s*\n/g, name: 'cookies' },
    
    // その他の未使用import
    { pattern: /import\s*{\s*ServerPagination\s*}\s*from\s*['"].*?['"]\s*;\s*\n/g, name: 'ServerPagination' },
    { pattern: /import\s*{\s*PopularTags\s*}\s*from\s*['"].*?['"]\s*;\s*\n/g, name: 'PopularTags' },
    { pattern: /import\s*{\s*Button\s*}\s*from\s*['"].*?ui\/button['"]\s*;\s*\n/g, name: 'Button' },
    { pattern: /import\s*Link\s*from\s*['"]next\/link['"]\s*;\s*\n/g, name: 'Link' },
    { pattern: /import\s*{\s*CardDescription\s*}\s*from\s*['"].*?['"]\s*;\s*\n/g, name: 'CardDescription' },
    { pattern: /import\s*{\s*BookOpen\s*,\s*Star\s*}\s*from\s*['"]lucide-react['"]\s*;\s*\n/g, name: 'BookOpen, Star' },
    { pattern: /import\s*{\s*Filter\s*}\s*from\s*['"]lucide-react['"]\s*;\s*\n/g, name: 'Filter' },
    { pattern: /import\s*{\s*Loader2\s*}\s*from\s*['"]lucide-react['"]\s*;\s*\n/g, name: 'Loader2' },
    { pattern: /import\s*{\s*useCallback\s*}\s*from\s*['"]react['"]\s*;\s*\n/g, name: 'useCallback' },
    { pattern: /import\s*Image\s*from\s*['"]next\/image['"]\s*;\s*\n/g, name: 'Image' }
  ];

  unusedImports.forEach(({ pattern, name }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, '');
      changes.push(`削除: ${name}`);
    }
  });

  // 部分的なimport削除（複数importから特定のものだけ削除）
  // CardHeader, CardTitle を削除しつつ Card, CardContent は残す
  content = content.replace(
    /import\s*{\s*Card\s*,\s*CardContent\s*,\s*CardHeader\s*,\s*CardTitle\s*}\s*from\s*['"].*?\/card['"]/g,
    "import { Card, CardContent } from '@/components/ui/card'"
  );

  // Tabs関連を削除
  content = content.replace(
    /import\s*{\s*Tabs\s*,\s*TabsContent\s*,\s*TabsList\s*,\s*TabsTrigger\s*}\s*from\s*['"].*?\/tabs['"]\s*;\s*\n/g,
    ''
  );

  // 変更があった場合のみファイルを更新
  if (content !== originalContent) {
    writeFileSync(filePath, content);
    fixedFiles.push(file);
    console.log(`✅ ${file}`);
    changes.forEach(change => console.log(`   - ${change}`));
  }
});

console.log('\n📊 修正結果:');
console.log(`   修正したファイル数: ${fixedFiles.length}`);

if (fixedFiles.length > 0) {
  console.log('\n✨ 未使用import/変数の修正が完了しました！');
  console.log('\n次のステップ:');
  console.log('1. npm run lint でエラーが減ったことを確認');
  console.log('2. npm test でテストが通ることを確認');
  console.log('3. npm run build でビルドが成功することを確認');
} else {
  console.log('\n✨ 修正が必要なファイルはありませんでした。');
}