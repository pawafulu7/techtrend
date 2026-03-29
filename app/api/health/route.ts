import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export async function GET() {
  try {
    // Check database connection (result intentionally discarded - connectivity check only)
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        api: 'operational',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check: database connection failed');
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Internal server error',
        services: {
          database: 'disconnected',
          api: 'operational',
        },
      },
      { status: 503 }
    );
  }
}
