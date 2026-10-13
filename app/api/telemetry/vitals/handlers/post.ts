/**
 * POST /api/telemetry/vitals
 *
 * Receives Web Vitals metrics from client-side reporter
 * Stores in buffer for aggregation and analysis
 */
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { AppError, formatErrorResponse } from '@/lib/errors';
import { readJsonWithLimit } from '@/lib/utils/http/read-json-with-limit';
import { storeMetric, webVitalsSchema } from './store';

const logger = createLogger('telemetry:vitals');

// 本文は id・page が上限いっぱいでも 3KB に届かない
const MAX_BODY_BYTES = 4096;

export async function handlePost(request: NextRequest): Promise<NextResponse> {
  try {
    // handler が読むのは上限まで。JSON として読めない本文は、形の合わない本文と同じく 400 にする
    const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!body.ok && body.reason === 'too_large') {
      return NextResponse.json(
        formatErrorResponse(
          new AppError('Request body is too large', 'PAYLOAD_TOO_LARGE', 413)
        ),
        { status: 413 }
      );
    }
    const parsed = webVitalsSchema.safeParse(body.ok ? body.value : undefined);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const metric = parsed.data;

    // Log metric for analysis (structured logging)。同じ計測の送り直しを後で見分けられるよう、
    // id と送った時刻も載せる
    logger.info({
      type: 'web_vital',
      metric: metric.name,
      id: metric.id,
      value: metric.value,
      rating: metric.rating,
      page: metric.page,
      navigationType: metric.navigationType,
      sentAt: metric.timestamp,
    });

    storeMetric(metric);

    // Return 204 No Content for successful telemetry
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, 'Failed to process Web Vitals metric');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
