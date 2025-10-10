#!/usr/bin/env -S npx tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface QualityIssue {
  type: 'source_based' | 'overly_generic' | 'case_duplicate';
  tags: string[];
  articleCount?: number;
}

// ソースベースタグの検出パターン
const SOURCE_NAME_PATTERNS = [
  /^(Hacker\s*News|HackerNews)$/i,
  /^(Tech\s*News|TechNews)$/i,
  /^Medium$/i,
  /^Mozilla$/i,
  /^Cloudflare$/i,
  /^GitHub$/i,
  /^GitLab$/i,
  /^(Hugging\s*Face|HuggingFace)$/i,
  /^(Google|Microsoft|Apple|Meta|Amazon|Netflix|Uber|Airbnb|Spotify)$/i,
  /^AWS$/i,  // 注意: AWSサービス名との区別が必要
];

// 一般的すぎるタグ
const OVERLY_GENERIC_TAGS = [
  'Technology',
  'Programming',
  'Tech News',
  'Software Engineering',
  'Tech Companies',
  'Engineering Blog',
  'Web Development',
  'Frontend',
  'Backend',
  'Cloud',
];

async function checkTagQuality(): Promise<{
  issues: QualityIssue[];
  totalTags: number;
  totalArticles: number;
}> {
  console.log('タグ品質チェックを開始します...\n');

  const issues: QualityIssue[] = [];
  let totalTags = 0;
  let totalArticles = 0;

  try {
    // 1. 全タグを取得
    const allTags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });

    totalTags = allTags.length;
    const articleCounts = allTags.map(t => t._count.articles);
    totalArticles = Math.max(...articleCounts, 0);

    console.log(`📊 タグ統計:`);
    console.log(`   総タグ数: ${totalTags}`);
    console.log(`   最大使用数: ${totalArticles}記事\n`);

    // 2. ソースベースタグの検出
    const sourceBasedTags = allTags.filter(tag =>
      SOURCE_NAME_PATTERNS.some(pattern => pattern.test(tag.name)) &&
      tag.name !== 'AWS'  // AWSは例外（技術タグとして広く使用）
    );

    if (sourceBasedTags.length > 0) {
      console.log('⚠️ ソースベースタグが検出されました:');
      const tagList: string[] = [];
      for (const tag of sourceBasedTags) {
        console.log(`   - ${tag.name}: ${tag._count.articles}記事`);
        tagList.push(`${tag.name} (${tag._count.articles})`);
      }
      issues.push({
        type: 'source_based',
        tags: tagList,
        articleCount: sourceBasedTags.reduce((sum, t) => sum + t._count.articles, 0)
      });
    } else {
      console.log('✅ ソースベースタグは検出されませんでした。');
    }

    // 3. 一般的すぎるタグの検出
    const genericTags = allTags.filter(tag =>
      OVERLY_GENERIC_TAGS.includes(tag.name)
    );

    if (genericTags.length > 0) {
      console.log('\n⚠️ 一般的すぎるタグが検出されました:');
      const tagList: string[] = [];
      for (const tag of genericTags) {
        console.log(`   - ${tag.name}: ${tag._count.articles}記事`);
        tagList.push(`${tag.name} (${tag._count.articles})`);
      }
      issues.push({
        type: 'overly_generic',
        tags: tagList,
        articleCount: genericTags.reduce((sum, t) => sum + t._count.articles, 0)
      });
    } else {
      console.log('\n✅ 一般的すぎるタグは検出されませんでした。');
    }

    // 4. タグの重複検出（大文字小文字の違いのみ）
    const tagNames = allTags.map(t => ({ name: t.name, count: t._count.articles }));
    const lowerCaseMap = new Map<string, Array<{ name: string; count: number }>>();

    for (const tag of tagNames) {
      const lower = tag.name.toLowerCase();
      if (!lowerCaseMap.has(lower)) {
        lowerCaseMap.set(lower, []);
      }
      lowerCaseMap.get(lower)!.push(tag);
    }

    const duplicates = Array.from(lowerCaseMap.entries())
      .filter(([_, tags]) => tags.length > 1)
      .sort((a, b) => {
        const sumA = a[1].reduce((s, t) => s + t.count, 0);
        const sumB = b[1].reduce((s, t) => s + t.count, 0);
        return sumB - sumA;
      });

    if (duplicates.length > 0) {
      console.log('\n⚠️ タグの重複が検出されました（大文字小文字の違いのみ）:');
      const tagList: string[] = [];
      for (const [lower, tags] of duplicates) {
        const tagStr = tags.map(t => `${t.name} (${t.count})`).join(', ');
        console.log(`   - ${tagStr}`);
        tagList.push(tagStr);
      }
      issues.push({
        type: 'case_duplicate',
        tags: tagList
      });
    } else {
      console.log('\n✅ タグの重複は検出されませんでした。');
    }

    // 5. 人気タグトップ15を表示
    const topTags = allTags
      .sort((a, b) => b._count.articles - a._count.articles)
      .slice(0, 15);

    console.log('\n📈 人気タグトップ15:');
    topTags.forEach((tag, index) => {
      console.log(`   ${index + 1}. ${tag.name}: ${tag._count.articles}記事`);
    });

    // 6. 最終サマリー
    console.log('\n' + '='.repeat(50));
    if (issues.length === 0) {
      console.log('✅ タグ品質チェック完了: 問題は検出されませんでした。');
    } else {
      console.log(`⚠️ タグ品質チェック完了: ${issues.length}件の問題が検出されました。`);
      console.log('   詳細は上記を確認してください。');
    }
    console.log('='.repeat(50));

    return { issues, totalTags, totalArticles };

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の解析
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
タグ品質チェックスクリプト

使用方法:
  npm run tsx scripts/monitoring/check-tag-quality.ts [オプション]

オプション:
  --help     このヘルプを表示
  --json     JSON形式で出力

チェック項目:
  1. ソースベースタグの検出
  2. 一般的すぎるタグの検出
  3. タグの重複検出（大文字小文字）
  4. 人気タグトップ15の表示

例:
  # 通常実行
  npm run tsx scripts/monitoring/check-tag-quality.ts

  # JSON形式で出力
  npm run tsx scripts/monitoring/check-tag-quality.ts --json
    `);
    process.exit(0);
  }

  const result = await checkTagQuality();

  if (args.includes('--json')) {
    console.log('\n' + JSON.stringify(result, null, 2));
  }

  // 問題が検出された場合は終了コード1を返す（CI/CD用）
  process.exit(result.issues.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
