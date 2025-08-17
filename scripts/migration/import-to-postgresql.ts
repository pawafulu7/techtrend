#!/usr/bin/env tsx

/**
 * PostgreSQLデータインポートスクリプト
 * エクスポートしたJSONデータをPostgreSQLにインポート
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_POSTGRESQL || 'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_dev'
    }
  }
});

const EXPORT_DIR = path.join(__dirname, 'exported-data');

async function verifyExportFiles() {
  const requiredFiles = [
    'manifest.json',
    'sources.json',
    'tags.json',
    'articles.json',
    'article-tag-relations.json'
  ];

  for (const file of requiredFiles) {
    try {
      await fs.access(path.join(EXPORT_DIR, file));
    } catch {
      throw new Error(`Required export file not found: ${file}`);
    }
  }
  
  console.log('✓ All export files verified');
}

async function clearDatabase() {
  console.log('Clearing existing data...');
  
  // 順序重要: 外部キー制約のため
  await prisma.$executeRaw`DELETE FROM "_ArticleToTag"`;
  await prisma.article.deleteMany({});
  await prisma.tag.deleteMany({});
  await prisma.source.deleteMany({});
  
  console.log('✓ Database cleared');
}

async function importSources() {
  console.log('Importing sources...');
  
  const data = await fs.readFile(
    path.join(EXPORT_DIR, 'sources.json'),
    'utf-8'
  );
  const sources = JSON.parse(data);
  
  for (const source of sources) {
    await prisma.source.create({
      data: {
        id: source.id,
        name: source.name,
        type: source.type,
        url: source.url,
        enabled: source.enabled,
        createdAt: new Date(source.createdAt),
        updatedAt: new Date(source.updatedAt)
      }
    });
  }
  
  console.log(`✓ Imported ${sources.length} sources`);
  return sources.length;
}

async function importTags() {
  console.log('Importing tags...');
  
  const data = await fs.readFile(
    path.join(EXPORT_DIR, 'tags.json'),
    'utf-8'
  );
  const tags = JSON.parse(data);
  
  // バッチ処理で高速化
  const batchSize = 100;
  for (let i = 0; i < tags.length; i += batchSize) {
    const batch = tags.slice(i, i + batchSize);
    await prisma.tag.createMany({
      data: batch.map((tag: any) => ({
        id: tag.id,
        name: tag.name,
        category: tag.category
      }))
    });
    process.stdout.write(`\r  Processing: ${Math.min(i + batchSize, tags.length)}/${tags.length} tags...`);
  }
  
  console.log(`\n✓ Imported ${tags.length} tags`);
  return tags.length;
}

async function importArticles() {
  console.log('Importing articles...');
  
  const data = await fs.readFile(
    path.join(EXPORT_DIR, 'articles.json'),
    'utf-8'
  );
  const articles = JSON.parse(data);
  
  const batchSize = 50;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    
    // 記事とタグの関連を個別に処理
    for (const article of batch) {
      const tagIds = article.tags.map((tag: any) => ({ id: tag.id }));
      
      await prisma.article.create({
        data: {
          id: article.id,
          title: article.title,
          url: article.url,
          summary: article.summary,
          thumbnail: article.thumbnail,
          content: article.content,
          publishedAt: new Date(article.publishedAt),
          sourceId: article.sourceId,
          bookmarks: article.bookmarks,
          qualityScore: article.qualityScore,
          userVotes: article.userVotes,
          createdAt: new Date(article.createdAt),
          updatedAt: new Date(article.updatedAt),
          difficulty: article.difficulty,
          detailedSummary: article.detailedSummary,
          articleType: article.articleType,
          summaryVersion: article.summaryVersion,
          tags: {
            connect: tagIds
          }
        }
      });
    }
    
    process.stdout.write(`\r  Processing: ${Math.min(i + batchSize, articles.length)}/${articles.length} articles...`);
  }
  
  console.log(`\n✓ Imported ${articles.length} articles`);
  return articles.length;
}

async function verifyImport() {
  console.log('\nVerifying import...');
  
  const sourcesCount = await prisma.source.count();
  const tagsCount = await prisma.tag.count();
  const articlesCount = await prisma.article.count();
  
  const manifest = JSON.parse(
    await fs.readFile(path.join(EXPORT_DIR, 'manifest.json'), 'utf-8')
  );
  
  const verification = {
    sources: sourcesCount === manifest.stats.sources,
    tags: tagsCount === manifest.stats.tags,
    articles: articlesCount === manifest.stats.articles
  };
  
  console.log('Verification results:');
  console.log(`  Sources: ${sourcesCount}/${manifest.stats.sources} ${verification.sources ? '✓' : '✗'}`);
  console.log(`  Tags: ${tagsCount}/${manifest.stats.tags} ${verification.tags ? '✓' : '✗'}`);
  console.log(`  Articles: ${articlesCount}/${manifest.stats.articles} ${verification.articles ? '✓' : '✗'}`);
  
  const allVerified = Object.values(verification).every(v => v);
  if (!allVerified) {
    throw new Error('Import verification failed!');
  }
  
  console.log('\n✓ All data verified successfully');
}

async function setupPostgreSQLExtensions() {
  console.log('Setting up PostgreSQL extensions...');
  
  try {
    // 全文検索用拡張
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent`;
    console.log('✓ PostgreSQL extensions configured');
  } catch (error) {
    console.warn('Warning: Could not create extensions (may require superuser privileges)');
    console.warn('Please run the following SQL manually:');
    console.warn('  CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    console.warn('  CREATE EXTENSION IF NOT EXISTS unaccent;');
  }
}

async function main() {
  try {
    console.log('Starting PostgreSQL data import...\n');
    
    await verifyExportFiles();
    
    const confirm = process.argv.includes('--force');
    if (!confirm) {
      console.log('⚠️  This will DELETE all existing data in the PostgreSQL database!');
      console.log('Run with --force flag to confirm');
      process.exit(1);
    }
    
    await clearDatabase();
    await setupPostgreSQLExtensions();
    
    const stats = {
      sources: await importSources(),
      tags: await importTags(),
      articles: await importArticles()
    };
    
    await verifyImport();
    
    console.log('\n========================================');
    console.log('Import completed successfully!');
    console.log('========================================\n');
    console.log('Summary:');
    console.log(`  Sources: ${stats.sources}`);
    console.log(`  Tags: ${stats.tags}`);
    console.log(`  Articles: ${stats.articles}`);
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();