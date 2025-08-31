import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.redirect(
        new URL('/auth/verify?error=invalid_token', request.url)
      );
    }

    // トークンの検証
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        token,
        identifier: email,
        expires: {
          gt: new Date(),
        },
      },
    });

    if (!verificationToken) {
      return NextResponse.redirect(
        new URL('/auth/verify?error=token_expired', request.url)
      );
    }

    // ユーザーのemailVerifiedを更新
    const user = await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
      },
    });

    // 一時的なログイントークンを作成（メール認証用）
    const tempLoginToken = crypto.randomBytes(32).toString('hex');
    const tempTokenExpires = new Date(Date.now() + 5 * 60 * 1000); // 5分間有効
    
    // 一時トークンを保存
    await prisma.verificationToken.create({
      data: {
        identifier: `login:${email}`,
        token: tempLoginToken,
        expires: tempTokenExpires,
      },
    });

    // 使用済みの認証トークンを削除
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token,
        },
      },
    });
    
    console.log('✅ Email verified successfully for:', email);
    console.log('🔑 Created temporary login token');

    // 成功ページへリダイレクト（一時トークンを付与）
    return NextResponse.redirect(
      new URL(`/auth/verify?success=true&email=${encodeURIComponent(email)}&loginToken=${tempLoginToken}`, request.url)
    );
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(
      new URL('/auth/verify?error=verification_failed', request.url)
    );
  }
}