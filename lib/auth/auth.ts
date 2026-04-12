import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { admin } from 'better-auth/plugins';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/config/env';
import logger from '@/lib/logger';

// Email sending logic
let resend: any = null;
if (env.RESEND_API_KEY) {
  try {
    const { Resend } = require('resend');
    resend = new Resend(env.RESEND_API_KEY);
  } catch (_error) {
    logger.warn('Resend module not installed.');
  }
}

function createNodemailerTransporter() {
  let nodemailer: any;
  try {
    nodemailer = require('nodemailer');
  } catch (_error) {
    return null;
  }
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return null;
}

const isProduction = process.env.NODE_ENV === 'production';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${env.PORT}`,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async (
      data: {
        user: { email: string; [key: string]: any };
        url: string;
        token: string;
      },
      _request?: Request
    ) => {
      if (process.env.NODE_ENV === 'test' || env.SKIP_EMAIL_SEND === 'true') {
        return;
      }

      const { host } = new URL(data.url);
      const from = env.EMAIL_FROM || 'noreply@techtrend.example.com';
      const subject = 'TechTrend - メールアドレスの確認';
      const htmlContent = buildVerificationEmailHtml(data.url, host);
      const textContent = buildVerificationEmailText(data.url, host);

      // Gmail/SMTP configured → use nodemailer
      if (env.GMAIL_USER) {
        const transporter = createNodemailerTransporter();
        if (transporter) {
          void transporter.sendMail({
            from,
            to: data.user.email,
            subject,
            html: htmlContent,
            text: textContent,
          });
          return;
        }
      }
      // Fallback to Resend
      if (resend) {
        void resend.emails.send({
          from,
          to: data.user.email,
          subject,
          html: htmlContent,
          text: textContent,
        });
        return;
      }
      if (process.env.NODE_ENV !== 'development') {
        logger.error('No email provider configured');
      }
    },
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...((env.GITHUB_CLIENT_ID || env.GITHUB_ID) &&
    (env.GITHUB_CLIENT_SECRET || env.GITHUB_SECRET)
      ? {
          github: {
            clientId: (env.GITHUB_CLIENT_ID || env.GITHUB_ID)!,
            clientSecret: (env.GITHUB_CLIENT_SECRET || env.GITHUB_SECRET)!,
          },
        }
      : {}),
  },

  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    updateAge: 24 * 60 * 60, // 1 day in seconds
  },

  plugins: [
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
  ],

  user: {
    additionalFields: {
      deletedAt: {
        type: 'date' as const,
        required: false,
        input: false,
      },
      personalizationPeriodMonths: {
        type: 'number' as const,
        required: false,
        defaultValue: 12,
        input: false,
      },
    },
  },

  advanced: {
    useSecureCookies: isProduction,
  },
});

// Email HTML template
function buildVerificationEmailHtml(url: string, host: string): string {
  const escapedHost = host.replace(/\./g, '&#8203;.');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><tr><td style="padding:40px 30px;text-align:center;"><h1 style="color:#333333;margin:0 0 20px 0;font-size:24px;">TechTrend メールアドレスの確認</h1><p style="color:#666666;margin:0 0 30px 0;font-size:16px;line-height:1.5;"><strong>${escapedHost}</strong> へのサインインを完了するには、<br>以下のボタンをクリックしてください。</p><table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background-color:#0070f3;border-radius:6px;"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:500;">メールアドレスを確認する</a></td></tr></table><p style="color:#999999;margin:30px 0 0 0;font-size:14px;">このメールに心当たりがない場合は、無視してください。<br>リンクは24時間有効です。</p></td></tr><tr><td style="padding:20px 30px;background-color:#f8f8f8;border-top:1px solid #e0e0e0;text-align:center;border-radius:0 0 8px 8px;"><p style="color:#999999;margin:0;font-size:12px;">このメールは自動送信されています。返信はできません。</p></td></tr></table></td></tr></table></body></html>`;
}

function buildVerificationEmailText(url: string, host: string): string {
  return `TechTrend メールアドレスの確認\n\n${host} へのサインインを完了するには、以下のリンクをクリックしてください：\n\n${url}\n\nこのメールに心当たりがない場合は、無視してください。\nリンクは24時間有効です。\n\nこのメールは自動送信されています。`;
}

export type Auth = typeof auth;
