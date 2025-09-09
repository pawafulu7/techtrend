import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // 1. セッション確認
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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
        password: true, // hasPasswordの判定に必要
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 3. レスポンス構造の作成
    const userProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt.toISOString(), // ISO 8601形式
      hasPassword: !!user.password,
      providers: Array.from(new Set(user.accounts.map(a => a.provider))), // 重複排除
    };

    return NextResponse.json(userProfile);
  } catch (error) {
    logger.error({ error, userId: session?.user?.id }, 'Error fetching user profile');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}