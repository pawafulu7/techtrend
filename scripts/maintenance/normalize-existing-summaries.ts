import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

// 詳細要約の正規化関数（manage-summaries.tsと同じロジック）
function normalizeDetailedSummary(text: string): string {
  const lines = text.split('\n');
  const normalizedLines: string[] = [];
  
  // ラベルのマッピング
  const labelPatterns = [
    { pattern: /記事の主題|技術的背景/, expectedLabel: '記事の主題は、', index: 0 },
    { pattern: /具体的な問題|解決しようとしている問題/, expectedLabel: '具体的な問題は、', index: 1 },
    { pattern: /解決策|技術的アプローチ/, expectedLabel: '提示されている解決策は、', index: 2 },
    { pattern: /実装方法|コード例/, expectedLabel: '実装方法の詳細については、', index: 3 },
    { pattern: /期待される効果|性能改善/, expectedLabel: '期待される効果は、', index: 4 },
    { pattern: /注意点|制約事項/, expectedLabel: '実装時の注意点は、', index: 5 }
  ];
  
  let currentIndex = 0;
  
  for (const line of lines) {
    if (line.trim().startsWith('・')) {
      let normalizedLine = line.trim();
      const content = normalizedLine.substring(1).trim();
      
      // ラベルがない場合、インデックスに基づいて追加
      let hasLabel = false;
      for (const labelPattern of labelPatterns) {
        if (content.match(labelPattern.pattern)) {
          hasLabel = true;
          break;
        }
      }
      
      if (!hasLabel && currentIndex < labelPatterns.length) {
        const expectedLabel = labelPatterns[currentIndex].expectedLabel;
        if (expectedLabel) {
          normalizedLine = `・${expectedLabel}${content}`;
        }
      }
      
      normalizedLines.push(normalizedLine);
      currentIndex++;
    } else if (line.trim()) {
      normalizedLines.push(line);
    }
  }
  
  return normalizedLines.join('\n');
}

async function normalizeExistingSummaries(dryRun = false) {
  console.error(`📝 既存の詳細要約を正規化します...${dryRun ? ' (ドライランモード)' : ''}`);
  
  // ラベルなしの記事を取得
  const articles = await prisma.article.findMany({
    where: {
      AND: [
        { detailedSummary: { not: null } },
        { NOT: { detailedSummary: { contains: '記事の主題は' } } }
      ]
    },
    select: {
      id: true,
      title: true,
      detailedSummary: true
    }
  });
  
  console.error(`対象記事数: ${articles.length}件`);
  
  let updatedCount = 0;
  let skipCount = 0;
  
  for (const article of articles) {
    if (!article.detailedSummary) continue;
    
    const normalized = normalizeDetailedSummary(article.detailedSummary);
    
    // 変更があった場合のみ更新
    if (normalized !== article.detailedSummary) {
      console.error(`\n--- ${article.title.substring(0, 50)}...`);
      console.error('変更前:');
      const beforeLines = article.detailedSummary.split('\n').slice(0, 3);
      beforeLines.forEach(line => console.error(`  ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`));
      
      console.error('変更後:');
      const afterLines = normalized.split('\n').slice(0, 3);
      afterLines.forEach(line => console.error(`  ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`));
      
      if (!dryRun) {
        await prisma.article.update({
          where: { id: article.id },
          data: { detailedSummary: normalized }
        });
        console.error('✓ 更新しました');
      } else {
        console.error('→ ドライランのため更新をスキップ');
      }
      
      updatedCount++;
    } else {
      skipCount++;
    }
  }
  
  console.error(`\n📊 処理結果:`);
  console.error(`   正規化対象: ${updatedCount}件`);
  console.error(`   変更なし: ${skipCount}件`);
  
  if (dryRun) {
    console.error(`\n💡 実際に更新するには、--no-dry-run オプションを付けて実行してください`);
  } else {
    console.error(`\n✅ 正規化完了: ${updatedCount}件を更新`);
  }
  
  await prisma.$disconnect();
}

// コマンドライン引数の処理
const args = process.argv.slice(2);
const dryRun = !args.includes('--no-dry-run');

if (require.main === module) {
  normalizeExistingSummaries(dryRun)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('エラー:', error);
      process.exit(1);
    });
}

export { normalizeDetailedSummary };