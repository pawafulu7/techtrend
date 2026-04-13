#!/usr/bin/env npx tsx
/**
 * AI/LLM新規ソース追加スクリプト
 * NVIDIA Developer BlogとDeepMind Blogを登録
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import logger from '@/lib/logger';

const prisma = createPrismaClient();

async function addAILLMSources() {
  logger.info('AI/LLM新規ソース追加開始');

  try {
    // NVIDIA Developer Blog
    const nvidiaSource = await prisma.source.upsert({
      where: { name: 'NVIDIA Developer Blog' },
      update: {
        url: 'https://developer.nvidia.com/blog/feed',
        enabled: true,
      },
      create: {
        name: 'NVIDIA Developer Blog',
        url: 'https://developer.nvidia.com/blog/feed',
        type: 'RSS',
        enabled: true,
      },
    });
    logger.info(`✅ NVIDIA Developer Blog 登録完了: ${nvidiaSource.id}`);

    // DeepMind Blog
    const deepmindSource = await prisma.source.upsert({
      where: { name: 'DeepMind Blog' },
      update: {
        url: 'https://deepmind.google/blog/rss.xml',
        enabled: true,
      },
      create: {
        name: 'DeepMind Blog',
        url: 'https://deepmind.google/blog/rss.xml',
        type: 'RSS',
        enabled: true,
      },
    });
    logger.info(`✅ DeepMind Blog 登録完了: ${deepmindSource.id}`);

    // 登録確認
    const aiSources = await prisma.source.findMany({
      where: {
        enabled: true,
        OR: [
          { name: { contains: 'AI' } },
          { name: { contains: 'DeepMind' } },
          { name: { contains: 'NVIDIA' } },
          { name: { contains: 'LLM' } },
        ]
      },
      select: {
        name: true,
        url: true,
        type: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    logger.info('\n現在有効なAI/LLMソース:');
    aiSources.forEach((source, index) => {
      logger.info(`${index + 1}. ${source.name} (${source.type})`);
      logger.info(`   URL: ${source.url}`);
    });

    // 統計情報
    const totalSources = await prisma.source.count();
    const aiSourceCount = await prisma.source.count({
      where: {
        OR: [
          { name: { contains: 'AI' } },
          { name: { contains: 'DeepMind' } },
          { name: { contains: 'NVIDIA' } },
          { name: { contains: 'LLM' } },
          { name: { contains: 'Hugging Face' } },
          { name: { contains: 'OpenAI' } },
          { name: { contains: 'arXiv' } },
          { name: { contains: 'Google AI' } },
        ]
      },
    });
    const enabledCount = await prisma.source.count({
      where: { enabled: true },
    });

    logger.info('\n📊 ソース統計:');
    logger.info(`総ソース数: ${totalSources}`);
    logger.info(`AI/LLMソース: ${aiSourceCount}`);
    logger.info(`有効なソース: ${enabledCount}`);

  } catch (error) {
    logger.error('ソース追加エラー:', error);
    throw error; // finallyの実行を保証
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
addAILLMSources()
  .then(() => {
    logger.success('AI/LLMソース追加完了');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('実行エラー:', error);
    process.exit(1);
  });