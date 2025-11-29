/**
 * Processing Logs API
 * Returns ProcessingLog entries with status summary
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export interface ProcessingLogEntry {
  id: string;
  processName: string;
  status: 'success' | 'failed' | 'partial';
  processedCount: number;
  lastProcessedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ProcessingLogsResponse {
  logs: ProcessingLogEntry[];
  summary: {
    total: number;
    successCount: number;
    failedCount: number;
    partialCount: number;
    successRate: number;
  };
  lastUpdated: string;
}

/**
 * Sanitize metadata to remove sensitive information
 */
function sanitizeMetadata(
  metadata: unknown
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const sanitized = { ...metadata } as Record<string, unknown>;

  // Remove potentially sensitive fields
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'stack'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }

  // Truncate long error messages
  if (typeof sanitized.error === 'string' && sanitized.error.length > 500) {
    sanitized.error = sanitized.error.substring(0, 500) + '...';
  }

  return sanitized;
}

export async function GET() {
  // Admin authorization check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access required.' },
      { status: 401 }
    );
  }

  try {
    // Fetch all processing logs ordered by lastProcessedAt
    const logs = await prisma.processingLog.findMany({
      orderBy: { lastProcessedAt: 'desc' },
    });

    // Calculate summary statistics
    const statusCounts = {
      success: 0,
      failed: 0,
      partial: 0,
    };

    const formattedLogs: ProcessingLogEntry[] = logs.map((log) => {
      const status = log.status as 'success' | 'failed' | 'partial';
      statusCounts[status]++;

      return {
        id: log.id,
        processName: log.processName,
        status,
        processedCount: log.processedCount,
        lastProcessedAt: log.lastProcessedAt.toISOString(),
        metadata: sanitizeMetadata(log.metadata),
      };
    });

    const total = logs.length;
    const successRate = total > 0 ? (statusCounts.success / total) * 100 : 0;

    const response: ProcessingLogsResponse = {
      logs: formattedLogs,
      summary: {
        total,
        successCount: statusCounts.success,
        failedCount: statusCounts.failed,
        partialCount: statusCounts.partial,
        successRate: Math.round(successRate * 10) / 10,
      },
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[ProcessingLogsAPI] Failed to fetch logs');
    return NextResponse.json(
      { error: 'Failed to fetch processing logs' },
      { status: 500 }
    );
  }
}
