import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import TechMapPageClient from './page-client';
import type { ApiEntity } from './types';

export const metadata: Metadata = {
  title: '技術マップ - TechTrend',
  description: 'テクノロジー間の関係性をインタラクティブに可視化',
};

async function getInitialEntities(): Promise<ApiEntity[]> {
  try {
    const entities = await prisma.techEntity.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        mentionCount: true,
      },
      orderBy: { mentionCount: 'desc' },
      take: 50,
    });
    return entities;
  } catch (error) {
    logger.error({ error }, '[TechMapPage] Failed to fetch initial entities');
    return [];
  }
}

export default async function TechMapPage() {
  const initialEntities = await getInitialEntities();

  return <TechMapPageClient initialEntities={initialEntities} />;
}
