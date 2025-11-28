#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function exportData() {
  console.log('📊 データベースからデータをエクスポート中...');
  
  try {
    // 1. Sources
    console.log('📁 Sourcesをエクスポート中...');
    const sources = await prisma.source.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${sources.length}件のソース`);

    // 2. Articles（バッチ処理）
    console.log('📝 Articlesをエクスポート中...');
    const articles = [];
    const batchSize = 500;
    let skip = 0;
    
    while (true) {
      const batch = await prisma.article.findMany({
        skip,
        take: batchSize,
        orderBy: { id: 'asc' },
        include: {
          tags: {
            select: {
              name: true
            }
          }
        }
      });
      
      if (batch.length === 0) break;
      
      articles.push(...batch);
      skip += batchSize;
      console.log(`  処理中: ${articles.length}件...`);
    }
    console.log(`  ✅ ${articles.length}件の記事`);

    // 3. Tags
    console.log('🏷️ Tagsをエクスポート中...');
    const tags = await prisma.tag.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${tags.length}件のタグ`);

    // 4. Users
    console.log('👥 Usersをエクスポート中...');
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${users.length}件のユーザー`);

    // 5. ArticleViews
    console.log('👀 ArticleViewsをエクスポート中...');
    const articleViews = await prisma.articleView.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${articleViews.length}件のビュー`);

    // 6. Favorites
    console.log('⭐ Favoritesをエクスポート中...');
    const favorites = await prisma.favorite.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${favorites.length}件のお気に入り`);

    // 7. Accounts
    console.log('🔐 Accountsをエクスポート中...');
    const accounts = await prisma.account.findMany({
      orderBy: { id: 'asc' }
    });
    console.log(`  ✅ ${accounts.length}件のアカウント`);

    // データを整形
    const exportData = {
      sources,
      articles: articles.map(article => ({
        ...article,
        tagNames: article.tags.map(t => t.name)
      })),
      tags,
      users,
      articleViews,
      favorites,
      accounts
    };

    // JSONファイルとして保存
    const outputPath = path.join(process.cwd(), 'prisma', 'seed-data-full.json');
    await fs.writeFile(
      outputPath,
      JSON.stringify(exportData, null, 2),
      'utf-8'
    );

    const fileSizeInMB = ((await fs.stat(outputPath)).size / 1024 / 1024).toFixed(2);
    console.log(`\n✅ エクスポート完了！`);
    console.log(`📄 ファイル: ${outputPath}`);
    console.log(`📊 ファイルサイズ: ${fileSizeInMB} MB`);

    // seed.tsファイルも生成
    await generateSeedFile();

  } catch (error) {
    console.error('❌ エクスポートエラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function generateSeedFile() {
  console.log('\n🌱 seed.tsファイルを生成中...');
  
  const seedContent = `import { PrismaClient } from '@prisma/client';
import seedData from './seed-data-full.json';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 シーディング開始...');
  
  try {
    // 既存データをクリア（開発環境のみ）
    if (process.env.NODE_ENV !== 'production') {
      console.log('🗑️ 既存データをクリア中...');
      await prisma.favorite.deleteMany();
      await prisma.articleView.deleteMany();
      await prisma.account.deleteMany();
      await prisma.\$executeRaw\`DELETE FROM "_ArticleToTag"\`;
      await prisma.article.deleteMany();
      await prisma.tag.deleteMany();
      await prisma.user.deleteMany();
      await prisma.source.deleteMany();
    }

    // 1. Sources
    console.log('📁 Sourcesを作成中...');
    for (const source of seedData.sources) {
      await prisma.source.create({ data: source });
    }
    console.log(\`  ✅ \${seedData.sources.length}件のソース作成完了\`);

    // 2. Users
    console.log('👥 Usersを作成中...');
    for (const user of seedData.users) {
      await prisma.user.create({ data: user });
    }
    console.log(\`  ✅ \${seedData.users.length}件のユーザー作成完了\`);

    // 3. Tags
    console.log('🏷️ Tagsを作成中...');
    for (const tag of seedData.tags) {
      await prisma.tag.create({ data: tag });
    }
    console.log(\`  ✅ \${seedData.tags.length}件のタグ作成完了\`);

    // 4. Articles with relations
    console.log('📝 Articlesを作成中...');
    let articleCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < seedData.articles.length; i += batchSize) {
      const batch = seedData.articles.slice(i, i + batchSize);
      
      for (const article of batch) {
        const { tagNames, ...articleData } = article;
        
        await prisma.article.create({
          data: {
            ...articleData,
            tags: {
              connect: tagNames.map(name => ({ name }))
            }
          }
        });
        articleCount++;
      }
      
      console.log(\`  処理中: \${articleCount}/\${seedData.articles.length}件...\`);
    }
    console.log(\`  ✅ \${articleCount}件の記事作成完了\`);

    // 5. Accounts
    if (seedData.accounts.length > 0) {
      console.log('🔐 Accountsを作成中...');
      for (const account of seedData.accounts) {
        await prisma.account.create({ data: account });
      }
      console.log(\`  ✅ \${seedData.accounts.length}件のアカウント作成完了\`);
    }

    // 6. ArticleViews
    if (seedData.articleViews.length > 0) {
      console.log('👀 ArticleViewsを作成中...');
      for (const view of seedData.articleViews) {
        await prisma.articleView.create({ data: view });
      }
      console.log(\`  ✅ \${seedData.articleViews.length}件のビュー作成完了\`);
    }

    // 7. Favorites
    if (seedData.favorites.length > 0) {
      console.log('⭐ Favoritesを作成中...');
      for (const favorite of seedData.favorites) {
        await prisma.favorite.create({ data: favorite });
      }
      console.log(\`  ✅ \${seedData.favorites.length}件のお気に入り作成完了\`);
    }

    console.log('\\n✅ シーディング完了！');
    
  } catch (error) {
    console.error('❌ シーディングエラー:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.\$disconnect();
  });
`;

  const seedPath = path.join(process.cwd(), 'prisma', 'seed-full.ts');
  await fs.writeFile(seedPath, seedContent, 'utf-8');
  console.log(`✅ seed.tsファイル生成完了: ${seedPath}`);
}

// 実行
exportData().catch(console.error);