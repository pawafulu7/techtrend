import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Create a new user with email/password
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
      password: hashedPassword,
      name,
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.password) {
    throw new Error('User not found');
  }

  const isValid = await verifyPassword(currentPassword, user.password);
  if (!isValid) {
    throw new Error('Invalid current password');
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  return true;
}

/**
 * Delete user account
 */
export async function deleteUserAccount(userId: string) {
  // Delete all related data
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