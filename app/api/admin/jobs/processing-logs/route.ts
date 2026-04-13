/**
 * Processing Logs API
 * Returns ProcessingLog entries with status summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type {
  ProcessingLogEntry,
  ProcessingLogsResponse,
} from '@/app/dashboard/jobs/types';

/**
 * Query parameter defaults and limits
 */
const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Valid status values for processing logs
 */
const VALID_STATUSES = ['success', 'failed', 'partial'] as const;
type ProcessingStatus = (typeof VALID_STATUSES)[number];

/**
 * Type guard to validate status value
 */
function isValidStatus(status: unknown): status is ProcessingStatus {
  return (
    typeof status === 'string' &&
    VALID_STATUSES.includes(status as ProcessingStatus)
  );
}

/**
 * Sensitive key patterns to filter out (case-insensitive matching)
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'stack',
  'credentials',
  'auth',
  'bearer',
  'authorization',
];

/**
 * Check if a key contains sensitive information (case-insensitive)
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));
}

/**
 * Recursively sanitize an object, removing sensitive keys and truncating long strings
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive keys
    if (isSensitiveKey(key)) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Sanitize arrays (recursively process object elements)
      result[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }

  // Truncate long error messages at any level
  if (typeof result.error === 'string' && result.error.length > 500) {
    result.error = result.error.substring(0, 500) + '...';
  }

  return result;
}

/**
 * Sanitize metadata to remove sensitive information recursively
 */
function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return sanitizeObject(metadata as Record<string, unknown>);
}

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required.' },
        { status: 401 }
      );
    }

    // User existence check (prevent deleted user access)
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
    }

    // Authorization check (admin only)
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;

    // Parse days parameter (default: 7, range: 1-90)
    const daysParam = searchParams.get('days');
    const parsedDays = daysParam ? parseInt(daysParam, 10) : DEFAULT_DAYS;
    const days =
      Number.isNaN(parsedDays) || parsedDays < MIN_DAYS || parsedDays > MAX_DAYS
        ? DEFAULT_DAYS
        : parsedDays;

    // Parse limit parameter (default: 100, max: 500)
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
    const limit =
      Number.isNaN(parsedLimit) || parsedLimit < 1
        ? DEFAULT_LIMIT
        : Math.min(parsedLimit, MAX_LIMIT);

    // Calculate date range filter
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch processing logs with date filter and limit
    const logs = await prisma.processingLog.findMany({
      where: { lastProcessedAt: { gte: since } },
      orderBy: { lastProcessedAt: 'desc' },
      take: limit,
    });

    // Calculate summary statistics
    const statusCounts = {
      success: 0,
      failed: 0,
      partial: 0,
    };

    const formattedLogs: ProcessingLogEntry[] = logs.map((log) => {
      // Validate status with type guard, default to 'failed' for unknown values
      const status: ProcessingStatus = isValidStatus(log.status)
        ? log.status
        : 'failed';
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
