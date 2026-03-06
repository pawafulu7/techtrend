import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { prisma } from '@/lib/database';

async function handler(_request: NextRequest) {
  const rawUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdAt: true,
      deletedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const users = rawUsers.map((user) => ({
    ...user,
    role: user.role === 'admin' ? ('admin' as const) : ('user' as const),
  }));

  return NextResponse.json({ users });
}

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
