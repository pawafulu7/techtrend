import { NextRequest, NextResponse } from 'next/server';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/auth';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { createUserDeletedResponse } from '@/lib/middleware/with-user-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // 1. セッション確認
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. ユーザー情報取得（必要なフィールドのみ選択）
    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true,
        deletedAt: true, // Check if user is deleted
        accounts: {
          select: {
            providerId: true,
            password: true,
          },
        },
      },
    });

    // User not found or has been deleted
    if (!user || user.deletedAt) {
      return createUserDeletedResponse();
    }

    // 3. レスポンス構造の作成
    const credentialAccount = user.accounts.find(
      (a) => a.providerId === CREDENTIAL_PROVIDER_ID
    );
    const userProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt.toISOString(), // ISO 8601形式
      hasPassword: !!credentialAccount?.password,
      providers: Array.from(new Set(user.accounts.map((a) => a.providerId))), // 重複排除
    };

    return NextResponse.json(userProfile);
  } catch (error) {
    logger.error({ error }, 'Error fetching user profile');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
