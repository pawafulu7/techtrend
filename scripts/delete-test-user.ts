#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteTestUser() {
  const email = process.env.TEST_USER_EMAIL || process.argv[2];
  
  if (!email) {
    console.error('Error: Email is required');
    console.error('Usage: tsx scripts/delete-test-user.ts <email> or set TEST_USER_EMAIL env var');
    process.exit(1);
  }

  try {
    // パラメータ化されたクエリでユーザーを安全に削除
    const result = await prisma.user.deleteMany({
      where: {
        email: email
      }
    });

    if (result.count > 0) {
      console.log(`Test user with email ${email} deleted successfully`);
    } else {
      console.log(`No user found with email ${email}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Failed to delete test user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteTestUser();