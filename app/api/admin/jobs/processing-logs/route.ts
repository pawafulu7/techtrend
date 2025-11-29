/**
 * Processing Logs API
 * Returns ProcessingLog entries with status summary
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type {
  ProcessingLogEntry,
  ProcessingLogsResponse,
} from '@/app/dashboard/jobs/types';

/**
 * Valid status values for processing logs
 */
const VALID_STATUSES = ['success', 'failed', 'partial'] as const;
type ProcessingStatus = (typeof VALID_STATUSES)[number];

/**
 * Type guard to validate status value
 */
function isValidStatus(status: unknown): status is ProcessingStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as ProcessingStatus);
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
  // Authentication check
  const session = await auth();
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
      // Validate status with type guard, default to 'failed' for unknown values
      const status: ProcessingStatus = isValidStatus(log.status) ? log.status : 'failed';
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
