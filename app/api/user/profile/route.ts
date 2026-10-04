import { NextRequest, NextResponse } from 'next/server';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import {
  createUserDeletedResponse,
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getHandler(
  _request: NextRequest,
  context: WithUserValidationContext
) {
  try {
    // 認証と退会済みユーザーの拒否は withUserValidation が行う
    // ユーザー情報取得（必要なフィールドのみ選択）
    const user = await prisma.user.findUnique({
      where: {
        id: context.validatedUser.id,
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

    // withUserValidation の確認後に退会された場合への備え
    if (!user || user.deletedAt) {
      return createUserDeletedResponse();
    }

    // レスポンス構造の作成
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
    logger.error({ err: error }, 'Error fetching user profile');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withUserValidation(getHandler);
