import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { email, loginToken } = await request.json();

    if (!email || !loginToken) {
      return NextResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    // 一時トークンの検証のみ行う（実際の削除はCredentialsProviderで行う）
    const tempToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: `login:${email}`,
        token: loginToken,
        expires: {
          gt: new Date(),
        },
      },
    });

    if (!tempToken) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // ユーザー情報取得
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.emailVerified) {
      return NextResponse.json(
        { error: 'User not found or not verified' },
        { status: 404 }
      );
    }

    // トークンが有効であることを返す（実際のログインはクライアント側でsignInを使用）
    return NextResponse.json({
      success: true,
      message: 'Token is valid',
    });
  } catch (error) {
    logger.error({ error }, 'Auto-login validation error');
    return NextResponse.json(
      { error: 'Token validation failed' },
      { status: 500 }
    );
  }
}