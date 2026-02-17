import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import TechMapPageClient from './page-client';

export const metadata: Metadata = {
  title: '技術マップ - TechTrend',
  description: 'テクノロジー間の関係性をインタラクティブに可視化',
};

interface ApiEntity {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

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
    console.error('[TechMapPage] Failed to fetch initial entities:', error);
    return [];
  }
}

export default async function TechMapPage() {
  const initialEntities = await getInitialEntities();

  return <TechMapPageClient initialEntities={initialEntities} />;
}
