import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/database';
import { invalidateUserAuthCache } from '@/lib/auth/user-auth-cache';
import logger from '@/lib/logger';

const changeRoleSchema = z.object({
  action: z.literal('changeRole'),
  role: z.enum(['user', 'admin']),
});

const deactivateSchema = z.object({
  action: z.literal('deactivate'),
  reason: z.string().optional(),
});

const patchSchema = z.discriminatedUnion('action', [
  changeRoleSchema,
  deactivateSchema,
]);

async function handler(request: NextRequest, context: any) {
  const { id: targetUserId } = await context.params;
  const session = context.session;
  const currentUserId = session.user.id;

  let body: z.infer<typeof patchSchema>;
  try {
    const rawBody = await request.json();
    body = patchSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, role: true, deletedAt: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (body.action === 'changeRole') {
    if (targetUserId === currentUserId) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 }
      );
    }

    if (targetUser.role === 'admin' && body.role === 'user') {
      try {
        const updatedUser = await prisma.$transaction(async (tx) => {
          const adminCount = await tx.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "User"
            WHERE role = 'admin' AND "deletedAt" IS NULL
            FOR UPDATE
          `;

          if (Number(adminCount[0].count) <= 1) {
            throw new Error('LAST_ADMIN');
          }

          return tx.user.update({
            where: { id: targetUserId },
            data: { role: body.role },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
              deletedAt: true,
            },
          });
        });

        await invalidateUserAuthCache(targetUserId);

        logger.info(
          {
            targetUserId,
            previousRole: targetUser.role,
            newRole: body.role,
            adminUserId: currentUserId,
          },
          'User role changed by admin'
        );

        return NextResponse.json({ user: updatedUser });
      } catch (error) {
        if (error instanceof Error && error.message === 'LAST_ADMIN') {
          return NextResponse.json(
            { error: 'Cannot demote the last admin' },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: body.role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    await invalidateUserAuthCache(targetUserId);

    logger.info(
      {
        targetUserId,
        previousRole: targetUser.role,
        newRole: body.role,
        adminUserId: currentUserId,
      },
      'User role changed by admin'
    );

    return NextResponse.json({ user: updatedUser });
  }

  if (body.action === 'deactivate') {
    if (targetUserId === currentUserId) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    if (targetUser.deletedAt) {
      return NextResponse.json(
        { error: 'User is already deactivated' },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: { deletedAt: new Date() },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          deletedAt: true,
        },
      });

      await tx.userDeletionLog.create({
        data: {
          userId: targetUserId,
          email: targetUser.email,
          reason: body.reason || 'Deactivated by admin',
          deletedBy: 'admin',
          adminUserId: currentUserId,
        },
      });

      return user;
    });

    await invalidateUserAuthCache(targetUserId);

    logger.info(
      { targetUserId, adminUserId: currentUserId, reason: body.reason },
      'User deactivated by admin'
    );

    return NextResponse.json({ user: updatedUser });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export const PATCH = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(handler))
);
