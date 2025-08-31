import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { changePassword } from '@/lib/auth/utils';
import { z } from 'zod';

// パスワード変更リクエストのスキーマ
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export async function POST(request: NextRequest) {
  try {
    // セッション確認
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // リクエストボディの取得と検証
    const body = await request.json();
    
    const validationResult = changePasswordSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.flatten();
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errors.fieldErrors 
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validationResult.data;

    // パスワード変更処理
    try {
      await changePassword(
        session.user.id,
        currentPassword,
        newPassword
      );

      return NextResponse.json(
        { 
          success: true,
          message: 'Password changed successfully' 
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
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}