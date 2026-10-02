import {
  hashPassword as baHashPassword,
  verifyPassword as baVerifyPassword,
} from '@better-auth/utils/password';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { invalidateUserAuthCache } from './user-auth-cache';
import { CREDENTIAL_PROVIDER_ID } from './constants';

/**
 * Hash a password using Better Auth's scrypt implementation
 */
export async function hashPassword(password: string): Promise<string> {
  return baHashPassword(password);
}

/**
 * Verify a password against a Better Auth scrypt hash
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return baVerifyPassword(hashedPassword, password);
}

/**
 * Create a new user with email/password (test/seed use only)
 */
export async function createUser({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email,
        name,
        emailVerified: false,
      },
    });

    await tx.account.create({
      data: {
        userId: createdUser.id,
        providerId: CREDENTIAL_PROVIDER_ID,
        accountId: createdUser.id,
        password: hashedPassword,
      },
    });

    return createdUser;
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  data: {
    name?: string;
    image?: string;
  }
) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
    },
  });
}

/**
 * Change user password and revoke the user's other sessions
 *
 * パスワードの更新と、操作中以外のセッションの削除を 1 つのトランザクションで行う。
 * currentSessionToken は better-auth の getSession が返す session.token（DB の
 * Session.token と同じ生の値）。Cookie の値（"token.署名" の形）を渡すと一致する行が
 * 無く、操作中のセッションも消える。
 *
 * @returns 失効させたセッションの件数
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionToken: string
): Promise<number> {
  // 空文字のまま token: { not: '' } で消すと、操作中のセッションも含めて全部消えるため
  if (!currentSessionToken) {
    throw new Error('Session token is required');
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
  });

  if (!account || !account.password) {
    throw new Error('User not found');
  }

  const isValid = await verifyPassword(currentPassword, account.password);
  if (!isValid) {
    throw new Error('Invalid current password');
  }

  const hashedPassword = await hashPassword(newPassword);
  const verifiedHash = account.password;

  return prisma.$transaction(async (tx) => {
    // 検証したハッシュのままのときだけ更新する。同時に 2 つの変更が走ったとき、
    // 先に確定した変更を後の変更が黙って上書きしないため
    const updated = await tx.account.updateMany({
      where: { id: account.id, password: verifiedHash },
      data: { password: hashedPassword },
    });
    if (updated.count !== 1) {
      throw new Error('Password was changed concurrently');
    }

    const revoked = await tx.session.deleteMany({
      where: { userId, token: { not: currentSessionToken } },
    });
    return revoked.count;
  });
}

/**
 * @deprecated Use deleteUserAccountWithAudit instead
 * Hard delete is disabled in production for data integrity
 */
export async function deleteUserAccount(userId: string) {
  // Production environment check - hard delete is prohibited
  if (process.env.NODE_ENV === 'production') {
    logger.error({ userId }, 'Attempted hard delete in production');
    throw new Error(
      'Hard delete is disabled in production. Use deleteUserAccountWithAudit instead.'
    );
  }

  // Development environment only - delete all related data
  await prisma.$transaction([
    // Delete favorites
    prisma.favorite.deleteMany({
      where: { userId },
    }),
    // Delete article views
    prisma.articleView.deleteMany({
      where: { userId },
    }),
    // Delete accounts (OAuth)
    prisma.account.deleteMany({
      where: { userId },
    }),
    // Delete user
    prisma.user.delete({
      where: { id: userId },
    }),
  ]);

  return true;
}

/**
 * Delete user account with audit logging
 * Uses interactive transaction to ensure data consistency and proper cleanup
 */
export async function deleteUserAccountWithAudit(
  userId: string,
  options?: {
    reason?: string;
    clientIp?: string;
    userAgent?: string;
  }
) {
  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Get user info before deletion (for email and auth method)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          accounts: {
            select: { providerId: true, password: true },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // 2. Determine authentication method
      const credentialAccount = user.accounts.find(
        (a) => a.providerId === CREDENTIAL_PROVIDER_ID
      );
      const authMethod = credentialAccount?.password
        ? 'credentials'
        : user.accounts.map((a) => a.providerId).join(',');

      // 3. Delete verification tokens (no FK, manual cleanup required)
      await tx.verification.deleteMany({
        where: {
          identifier: user.email,
        },
      });

      // 4. Mark user as deleted (soft delete with deletedAt timestamp)
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      // 5. Create audit log
      await tx.userDeletionLog.create({
        data: {
          userId,
          email: user.email,
          reason: options?.reason,
          authMethod,
          clientIp: options?.clientIp,
          userAgent: options?.userAgent,
        },
      });

      return { email: user.email, authMethod };
    },
    {
      timeout: 10000, // 10 seconds timeout
    }
  );

  // 6. Invalidate user auth cache after successful transaction
  // This ensures subsequent JWT validations detect the deleted state
  // Best-effort: cache invalidation failure should not block session revocation
  try {
    await invalidateUserAuthCache(userId);
  } catch (error) {
    logger.warn(
      { userId, error },
      'Auth cache invalidation failed after deletion'
    );
  }

  // 7. Revoke all sessions for the deleted user
  // Retry once on failure; log error but do not throw (data integrity is preserved)
  try {
    await prisma.session.deleteMany({ where: { userId } });
  } catch (firstError) {
    logger.warn(
      { userId, error: firstError },
      'Session revocation failed, retrying'
    );
    try {
      await prisma.session.deleteMany({ where: { userId } });
    } catch (retryError) {
      logger.error(
        { userId, error: retryError },
        'Session revocation failed after retry — sessions may remain active'
      );
    }
  }

  return result;
}
