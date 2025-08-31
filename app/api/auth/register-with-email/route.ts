import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// 確認メール送信用の関数をインポート
async function sendVerificationEmail(email: string, token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodemailer: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodemailer = require('nodemailer');
  } catch (_error) {
    console.warn('Nodemailer not installed. Email sending disabled.');
    return;
  }
  
  // Gmail設定がある場合はそれを使用
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@techtrend.com',
    to: email,
    subject: 'TechTrend - メールアドレスの確認',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 30px; text-align: center;">
                      <h1 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">
                        TechTrend アカウント登録の確認
                      </h1>
                      <p style="color: #666666; margin: 0 0 30px 0; font-size: 16px; line-height: 1.5;">
                        アカウント登録ありがとうございます。<br>
                        以下のボタンをクリックして、メールアドレスの確認を完了してください。
                      </p>
                      <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                        <tr>
                          <td style="background-color: #0070f3; border-radius: 6px;">
                            <a href="${verifyUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500;">
                              メールアドレスを確認する
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #999999; margin: 30px 0 0 0; font-size: 14px;">
                        このメールに心当たりがない場合は、無視してください。<br>
                        リンクは24時間有効です。
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `TechTrend アカウント登録の確認

アカウント登録ありがとうございます。
以下のリンクをクリックして、メールアドレスの確認を完了してください：

${verifyUrl}

このメールに心当たりがない場合は、無視してください。
リンクは24時間有効です。
`,
  };

  await transporter.sendMail(mailOptions);
}

// パスワード強度検証関数
function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  const checks = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
  };

  if (!checks.minLength) {
    return { isValid: false, message: 'パスワードは8文字以上で入力してください' };
  }
  if (!checks.hasUpperCase) {
    return { isValid: false, message: 'パスワードには大文字を含めてください' };
  }
  if (!checks.hasLowerCase) {
    return { isValid: false, message: 'パスワードには小文字を含めてください' };
  }
  if (!checks.hasNumber) {
    return { isValid: false, message: 'パスワードには数字を含めてください' };
  }
  if (!checks.hasSpecial) {
    return { isValid: false, message: 'パスワードには記号(!@#$%^&*等)を含めてください' };
  }

  return { isValid: true };
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // バリデーション
    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    // パスワード強度チェック
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // 既存ユーザーのチェック
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています' },
        { status: 400 }
      );
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザーの作成（emailVerifiedはnullのまま）
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        emailVerified: null, // 未確認状態
      },
    });

    // 確認トークンの生成
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

    // トークンの保存
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    // 確認メールの送信
    try {
      await sendVerificationEmail(email, token);
    } catch (emailError) {
      console.error('📧 Failed to send verification email:', emailError);
      // メール送信に失敗してもユーザー作成は成功扱い（後で再送信できるように）
    }

    return NextResponse.json({
      success: true,
      message: 'アカウントを作成しました。確認メールをご確認ください。',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'アカウント作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}