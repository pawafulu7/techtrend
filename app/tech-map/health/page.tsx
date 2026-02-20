import type { Metadata } from 'next';
import { HeartPulse } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import HealthPageClient from './page-client';
import type { HealthScoreResult } from './types';
import logger from '@/lib/logger';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Tech Health Dashboard | TechTrend',
  description:
    'Monitor technology health across community activity, development velocity, article attention, and adoption breadth',
};

interface InitialHealthData {
  health: HealthScoreResult[];
  total: number;
}

async function getInitialHealth(): Promise<InitialHealthData> {
  try {
    // Dynamic import to handle case where service may not yet exist
    const { TechHealthService } =
      await import('@/lib/services/tech-health-service');
    const { prisma } = await import('@/lib/prisma');
    const service = new TechHealthService(prisma);
    const result = await service.getLatestHealth();
    return {
      health: result.data,
      total: result.total,
    };
  } catch (error) {
    logger.error({ error }, '[HealthPage] Failed to fetch initial health data');
    // Re-throw fatal DB errors to Next.js error boundary
    const { Prisma } = await import('@prisma/client');
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError
    ) {
      throw error;
    }
    return { health: [], total: 0 };
  }
}

export default async function HealthPage() {
  const { health, total } = await getInitialHealth();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        icon={HeartPulse}
        title="Tech Health Dashboard"
        description="Monitor technology health across community activity, development velocity, article attention, and adoption breadth"
        count={total > 0 ? { value: total, label: 'entities' } : undefined}
        variant="default"
        className="mb-6"
      />
      <HealthPageClient initialHealth={health} />
    </div>
  );
}
