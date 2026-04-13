#!/usr/bin/env -S npx tsx
import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

interface CleanupResult {
  removedTags: string[];
  affectedArticles: number;
  deletedTagCount: number;
}

// 削除対象のソースベースタグ
const SOURCE_BASED_TAGS = [
  'Hacker News',
  'Tech News',
  'Medium',
  'Engineering Blog',
  'Mozilla',
  'Cloudflare',
  'GitHub',
  'Hugging Face',
  // 企業名タグ（MediumEngineeringFetcherから付与）
  'Netflix',
  'Airbnb',
  'Uber',
  'Spotify',
];

// 一般的すぎるタグ（オプション：--remove-generic で削除）
const GENERIC_TAGS = [
  'Technology',
  'Programming',
  'Tech Companies',
  'Software Engineering',
  'Web Development',
  'Frontend',
  'Cloud',
];

async function removeSourceBasedTags(
  dryRun: boolean = true,
  removeGeneric: boolean = false
): Promise<CleanupResult> {
  console.log('ソースベースタグの削除を開始します...');
  console.log(`モード: ${dryRun ? 'ドライラン（実際には削除しません）' : '本番実行'}`);

  const tagsToRemove = removeGeneric
    ? [...SOURCE_BASED_TAGS, ...GENERIC_TAGS]
    : SOURCE_BASED_TAGS;

  console.log(`削除対象タグ: ${tagsToRemove.join(', ')}`);

  const result: CleanupResult = {
    removedTags: [],
    affectedArticles: 0,
    deletedTagCount: 0,
  };

  try {
    // 1. 削除対象タグを取得
    const tags = await prisma.tag.findMany({
      where: {
        name: { in: tagsToRemove }
      },
      include: {
        articles: {
          select: {
            id: true
          }
        }
      }
    });

    console.log(`\n削除対象タグの詳細:`);
    const articleIds = new Set<string>();
    for (const tag of tags) {
      const articleCount = tag.articles.length;
      console.log(`  - ${tag.name}: ${articleCount}記事に使用`);
      result.removedTags.push(tag.name);
      result.affectedArticles += articleCount;

      // 影響を受ける記事IDを収集
      tag.articles.forEach(article => articleIds.add(article.id));
    }

    console.log(`\n影響を受ける記事の合計: ${articleIds.size}件（重複除く）`);

    if (tags.length === 0) {
      console.log('削除対象のタグが見つかりませんでした。');
      return result;
    }

    if (!dryRun) {
      // 2. トランザクションで削除
      await prisma.$transaction(async (tx) => {
        // タグ自体を削除（Prismaが自動的に中間テーブルも削除）
        const deleteResult = await tx.tag.deleteMany({
          where: {
            name: { in: tagsToRemove }
          }
        });

        result.deletedTagCount = deleteResult.count;
        console.log(`\n削除完了: ${result.deletedTagCount}個のタグを削除しました。`);
      });
    } else {
      console.log(`\n[ドライラン] 本番実行時には${tags.length}個のタグを削除します。`);
      result.deletedTagCount = tags.length;
    }

    // 3. 統計情報を表示
    console.log(`\nクリーンアップ結果:`);
    console.log(`  削除対象タグ数: ${result.removedTags.length}`);
    console.log(`  影響を受ける記事数: ${result.affectedArticles}件（延べ）`);
    console.log(`  影響を受ける記事数: ${articleIds.size}件（実数）`);
    console.log(`  削除されたタグ数: ${result.deletedTagCount}`);

    return result;

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
  const dryRun = !args.includes('--execute');
  const removeGeneric = args.includes('--remove-generic');

  if (args.includes('--help')) {
    console.log(`
使用方法:
  npm run tsx scripts/maintenance/remove-source-based-tags.ts [オプション]

オプション:
  --execute         ドライランではなく実際に削除を実行
  --remove-generic  一般的すぎるタグも削除
  --help            このヘルプを表示

例:
  # ドライラン実行（デフォルト）
  npm run tsx scripts/maintenance/remove-source-based-tags.ts

  # 本番実行
  npm run tsx scripts/maintenance/remove-source-based-tags.ts --execute

  # 一般的タグも削除
  npm run tsx scripts/maintenance/remove-source-based-tags.ts --execute --remove-generic
    `);
    process.exit(0);
  }

  await removeSourceBasedTags(dryRun, removeGeneric);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
