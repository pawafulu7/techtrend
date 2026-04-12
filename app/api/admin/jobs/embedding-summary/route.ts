/**
 * Embedding Summary API
 * Returns EmbeddingJob statistics with stuck/high-retry job detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type {
  StuckJob,
  HighRetryJob,
  EmbeddingSummaryResponse,
} from '@/app/dashboard/jobs/types';

const DEFAULT_STUCK_THRESHOLD_MINUTES = 30;
const MIN_STUCK_THRESHOLD_MINUTES = 1;
const MAX_STUCK_THRESHOLD_MINUTES = 1440; // 24 hours
const HIGH_RETRY_THRESHOLD = 2;

export async function GET(request: NextRequest) {
  // Authentication check
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }

  // Authorization check (admin only)
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const stuckThresholdParam = searchParams.get('stuckThreshold');
    const parsedThreshold = stuckThresholdParam
      ? parseInt(stuckThresholdParam, 10)
      : DEFAULT_STUCK_THRESHOLD_MINUTES;

    // Validate threshold is within acceptable range (1-1440 minutes)
    const stuckThreshold =
      Number.isNaN(parsedThreshold) ||
      parsedThreshold < MIN_STUCK_THRESHOLD_MINUTES ||
      parsedThreshold > MAX_STUCK_THRESHOLD_MINUTES
        ? DEFAULT_STUCK_THRESHOLD_MINUTES
        : parsedThreshold;

    // Calculate cutoff time for stuck jobs
    const stuckCutoff = new Date(Date.now() - stuckThreshold * 60 * 1000);

    // Get status counts using groupBy
    const statusGroups = await prisma.embeddingJob.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusCounts = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      total: 0,
    };

    for (const group of statusGroups) {
      const status = group.status as keyof typeof statusCounts;
      if (status in statusCounts) {
        statusCounts[status] = group._count.status;
        statusCounts.total += group._count.status;
      }
    }

    // Calculate completion rate
    const completionRate =
      statusCounts.total > 0
        ? (statusCounts.COMPLETED / statusCounts.total) * 100
        : 0;

    // Find stuck jobs (PROCESSING for longer than threshold)
    const stuckJobsRaw = await prisma.embeddingJob.findMany({
      where: {
        status: 'PROCESSING',
        queuedAt: { lt: stuckCutoff },
      },
      orderBy: { queuedAt: 'asc' },
      take: 50,
    });

    const stuckJobs: StuckJob[] = stuckJobsRaw.map((job) => {
      const durationMinutes = Math.round(
        (Date.now() - job.queuedAt.getTime()) / 60000
      );
      return {
        id: job.id,
        articleId: job.articleId,
        queuedAt: job.queuedAt.toISOString(),
        processingSince: job.queuedAt.toISOString(),
        durationMinutes,
        attempts: job.attempts,
      };
    });

    // Find high-retry jobs (attempts >= threshold, not completed)
    const highRetryJobsRaw = await prisma.embeddingJob.findMany({
      where: {
        attempts: { gte: HIGH_RETRY_THRESHOLD },
        status: { not: 'COMPLETED' },
      },
      orderBy: { attempts: 'desc' },
      take: 50,
    });

    const highRetryJobs: HighRetryJob[] = highRetryJobsRaw.map((job) => ({
      id: job.id,
      articleId: job.articleId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      retriesRemaining: Math.max(0, job.maxAttempts - job.attempts),
      error: job.error ? truncateError(job.error) : null,
    }));

    const response: EmbeddingSummaryResponse = {
      statusCounts,
      completionRate: Math.round(completionRate * 10) / 10,
      stuckJobs,
      highRetryJobs,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[EmbeddingSummaryAPI] Failed to fetch summary');
    return NextResponse.json(
      { error: 'Failed to fetch embedding summary' },
      { status: 500 }
    );
  }
}

/**
 * Truncate error message for display
 */
function truncateError(error: string, maxLength = 200): string {
  if (error.length <= maxLength) {
    return error;
  }
  return error.substring(0, maxLength) + '...';
}
