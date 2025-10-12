import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { verifyPassword, deleteUserAccountWithAudit } from '@/lib/auth/utils';
import { prisma } from '@/lib/database';
import logger from '@/lib/logger';
import {
  DeleteAccountRequestSchema,
  DeleteAccountResponse,
  DeleteAccountError,
} from '@/types/api/delete-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest): Promise<NextResponse<DeleteAccountResponse | DeleteAccountError>> {
  try {
    // 1. Parse request body (handle JSON parse errors)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'リクエストの形式が正しくありません',
        },
        { status: 400 }
      );
    }

    // 2. Validate request with zod
    const validationResult = DeleteAccountRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'リクエストの形式が正しくありません',
        },
        { status: 400 }
      );
    }

    const { password, confirmationWord, reason } = validationResult.data;

    // 3. Verify session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: '認証が必要です',
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 4. Get user password for verification (other fields fetched in transaction)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'ユーザーが見つかりません',
        },
        { status: 404 }
      );
    }

    // 5. Verify password for password-based users
    if (user.password) {
      if (!password) {
        return NextResponse.json(
          {
            success: false,
            error: 'INVALID_PASSWORD',
            message: 'パスワードを入力してください',
          },
          { status: 400 }
        );
      }

      const isPasswordValid = await verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'INVALID_PASSWORD',
            message: 'パスワードが正しくありません',
          },
          { status: 401 }
        );
      }
    }

    // 6. Verification word is already validated by zod schema (must be 'DELETE')
    // This is a double-check for safety
    if (confirmationWord !== 'DELETE') {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_CONFIRMATION',
          message: '確認ワードが正しくありません',
        },
        { status: 400 }
      );
    }

    // 7. Extract client info for audit log
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    // 8. Delete user account with audit logging
    const result = await deleteUserAccountWithAudit(userId, {
      reason,
      clientIp,
      userAgent,
    });

    logger.info(
      {
        userId,
        email: result.email,
        authMethod: result.authMethod,
        clientIp,
      },
      'User account deleted successfully'
    );

    // 9. Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'アカウントが正常に削除されました',
        requiresLogout: true,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ error }, 'Error deleting user account');

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        return NextResponse.json(
          {
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'ユーザーが見つかりません',
          },
          { status: 404 }
        );
      }
    }

    // Generic error response (internal server error)
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'アカウント削除中にエラーが発生しました',
      },
      { status: 500 }
    );
  }
}
