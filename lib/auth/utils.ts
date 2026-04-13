import {
  hashPassword as baHashPassword,
  verifyPassword as baVerifyPassword,
} from '@better-auth/utils/password';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { invalidateUserAuthCache } from './user-auth-cache';
import { CREDENTIAL_PROVIDER_ID } from './auth';

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

  const user = await prisma.user.create({
    data: {
      email,
      name,
      emailVerified: false,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      accountId: user.id,
      password: hashedPassword,
    },
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
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
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

  await prisma.account.update({
    where: { id: account.id },
    data: { password: hashedPassword },
  });

  return true;
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
  await invalidateUserAuthCache(userId);

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
