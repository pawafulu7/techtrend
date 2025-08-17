#!/usr/bin/env tsx

/**
 * SQLiteデータエクスポートスクリプト
 * SQLiteデータベースから全データをJSON形式でエクスポート
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

// デフォルトのPrismaクライアントを使用（環境変数DATABASE_URLを使用）
const prisma = new PrismaClient();

const EXPORT_DIR = path.join(__dirname, 'exported-data');

async function ensureExportDir() {
  try {
    await fs.access(EXPORT_DIR);
  } catch {
    await fs.mkdir(EXPORT_DIR, { recursive: true });
  }
}

async function exportSources() {
  console.log('Exporting sources...');
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: 'asc' }
  });
  
  await fs.writeFile(
    path.join(EXPORT_DIR, 'sources.json'),
    JSON.stringify(sources, null, 2)
  );
  
  console.log(`✓ Exported ${sources.length} sources`);
  return sources.length;
}

async function exportTags() {
  console.log('Exporting tags...');
  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' }
  });
  
  await fs.writeFile(
    path.join(EXPORT_DIR, 'tags.json'),
    JSON.stringify(tags, null, 2)
  );
  
  console.log(`✓ Exported ${tags.length} tags`);
  return tags.length;
}

async function exportArticles() {
  console.log('Exporting articles...');
  const batchSize = 100;
  let offset = 0;
  let totalArticles = 0;
  const allArticles = [];

  while (true) {
    const articles = await prisma.article.findMany({
      skip: offset,
      take: batchSize,
      include: {
        tags: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (articles.length === 0) break;

    allArticles.push(...articles);
    totalArticles += articles.length;
    offset += batchSize;
    
    process.stdout.write(`\r  Processing: ${totalArticles} articles...`);
  }

  await fs.writeFile(
    path.join(EXPORT_DIR, 'articles.json'),
    JSON.stringify(allArticles, null, 2)
  );

  console.log(`\n✓ Exported ${totalArticles} articles`);
  return totalArticles;
}

async function exportArticleTagRelations() {
  console.log('Exporting article-tag relations...');
  
  const articles = await prisma.article.findMany({
    select: {
      id: true,
      tags: {
        select: {
          id: true
        }
      }
    }
  });

  const relations = [];
  for (const article of articles) {
    for (const tag of article.tags) {
      relations.push({
        articleId: article.id,
        tagId: tag.id
      });
    }
  }

  await fs.writeFile(
    path.join(EXPORT_DIR, 'article-tag-relations.json'),
    JSON.stringify(relations, null, 2)
  );

  console.log(`✓ Exported ${relations.length} article-tag relations`);
  return relations.length;
}

async function createExportManifest(stats: any) {
  const manifest = {
    exportedAt: new Date().toISOString(),
    database: 'SQLite',
    stats: stats,
    files: [
      'sources.json',
      'tags.json',
      'articles.json',
      'article-tag-relations.json'
    ]
  };

  await fs.writeFile(
    path.join(EXPORT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('✓ Created export manifest');
}

async function main() {
  try {
    console.log('Starting SQLite data export...\n');
    
    await ensureExportDir();
    
    const stats = {
      sources: await exportSources(),
      tags: await exportTags(),
      articles: await exportArticles(),
      relations: await exportArticleTagRelations()
    };

    await createExportManifest(stats);

    console.log('\n========================================');
    console.log('Export completed successfully!');
    console.log(`Data exported to: ${EXPORT_DIR}`);
    console.log('========================================\n');
    console.log('Summary:');
    console.log(`  Sources: ${stats.sources}`);
    console.log(`  Tags: ${stats.tags}`);
    console.log(`  Articles: ${stats.articles}`);
    console.log(`  Relations: ${stats.relations}`);
    
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();