import { NextRequest, NextResponse } from 'next/server';
import { changePassword } from '@/lib/auth/utils';
import { z } from 'zod';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';

// パスワード変更リクエストのスキーマ
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(
        72,
        'Password must be at most 72 characters for bcrypt compatibility'
      )
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

async function changePasswordHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  // 認証と退会済みユーザーの確認は withUserValidation が行う
  const userId = context.validatedUser.id;
  // 操作中のセッションを残し、他のセッションを失効させるために使う。
  // Cookie の値（"token.署名" の形）ではなく、getSession が返す生のトークンを使うこと。
  // Cookie の値で比べると一致する行が無く、操作中のセッションも消える
  const currentSessionToken = context.session.session?.token;
  if (!currentSessionToken) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required',
      },
      { status: 401 }
    );
  }

  try {
    // リクエストボディの取得と検証
    const body = await request.json();

    const validationResult = changePasswordSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten();
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: errors.fieldErrors,
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validationResult.data;

    // パスワード変更処理
    try {
      const revokedSessions = await changePassword(
        userId,
        currentPassword,
        newPassword,
        currentSessionToken
      );
      logger.info({ userId, revokedSessions }, 'Password changed');

      return NextResponse.json(
        {
          success: true,
          message: 'Password changed successfully',
        },
        { status: 200 }
      );
    } catch (error) {
      // changePassword関数からのエラーハンドリング
      if (error instanceof Error) {
        if (error.message === 'Invalid current password') {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400 }
          );
        }
        if (error.message === 'Session is no longer valid') {
          return NextResponse.json(
            {
              error: 'Unauthorized',
              code: 'NOT_AUTHENTICATED',
              message: 'Authentication required',
            },
            { status: 401 }
          );
        }
        if (error.message === 'Password was changed concurrently') {
          return NextResponse.json(
            { error: 'Password was changed by another request' },
            { status: 409 }
          );
        }
        if (error.message === 'User not found') {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }
      }

      throw error; // その他のエラーは再スロー
    }
  } catch (error) {
    logger.error({ err: error }, 'Password change error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withCSRFProtection(
  withRateLimit('write:password', withUserValidation(changePasswordHandler))
);
