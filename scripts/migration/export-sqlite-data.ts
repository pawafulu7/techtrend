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
  console.error('Exporting sources...');
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: 'asc' }
  });
  
  await fs.writeFile(
    path.join(EXPORT_DIR, 'sources.json'),
    JSON.stringify(sources, null, 2)
  );
  
  console.error(`✓ Exported ${sources.length} sources`);
  return sources.length;
}

async function exportTags() {
  console.error('Exporting tags...');
  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' }
  });
  
  await fs.writeFile(
    path.join(EXPORT_DIR, 'tags.json'),
    JSON.stringify(tags, null, 2)
  );
  
  console.error(`✓ Exported ${tags.length} tags`);
  return tags.length;
}

async function exportArticles() {
  console.error('Exporting articles...');
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

  console.error(`\n✓ Exported ${totalArticles} articles`);
  return totalArticles;
}

async function exportArticleTagRelations() {
  console.error('Exporting article-tag relations...');
  
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

  console.error(`✓ Exported ${relations.length} article-tag relations`);
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

  console.error('✓ Created export manifest');
}

async function main() {
  try {
    console.error('Starting SQLite data export...\n');
    
    await ensureExportDir();
    
    const stats = {
      sources: await exportSources(),
      tags: await exportTags(),
      articles: await exportArticles(),
      relations: await exportArticleTagRelations()
    };

    await createExportManifest(stats);

    console.error('\n========================================');
    console.error('Export completed successfully!');
    console.error(`Data exported to: ${EXPORT_DIR}`);
    console.error('========================================\n');
    console.error('Summary:');
    console.error(`  Sources: ${stats.sources}`);
    console.error(`  Tags: ${stats.tags}`);
    console.error(`  Articles: ${stats.articles}`);
    console.error(`  Relations: ${stats.relations}`);
    
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();