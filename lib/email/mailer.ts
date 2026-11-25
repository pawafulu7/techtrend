/**
 * メールの送信
 *
 * 登録の確認メール（lib/auth/auth.ts）と、利用の申請を許可した知らせ（lib/auth/site-gate/approval-email.ts）が使う。
 * 送信の設定は Gmail（GMAIL_USER・GMAIL_APP_PASSWORD）、SMTP（SMTP_HOST）、Resend（RESEND_API_KEY）の順に探す。
 */
import { env } from '@/lib/config/env';
import logger from '@/lib/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  /** 送信の設定に渡した */
  | 'sent'
  /** 送らない設定（テスト、SKIP_EMAIL_SEND） */
  | 'skipped'
  /** 送信の設定が無い */
  | 'no_provider';

const DEFAULT_EMAIL_FROM = 'noreply@techtrend.example.com';

let resend: any = null;
if (env.RESEND_API_KEY) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require('resend');
    resend = new Resend(env.RESEND_API_KEY);
  } catch (_error) {
    logger.warn('Resend module not installed.');
  }
}

function createNodemailerTransporter() {
  let nodemailer: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// 送信の設定は、モジュールを読んだときに 1 度だけ作る（接続は 1 通ごとに張り直す）
const nodemailerTransporter = createNodemailerTransporter();

/**
 * メールを 1 通送る。送信に失敗したら throw する（ログは呼び出し元が、宛先を伏せて出す）。
 * 送らない設定・送信の設定が無いときは throw せず、結果で返す
 */
export async function sendEmail(
  message: EmailMessage
): Promise<SendEmailResult> {
  if (process.env.NODE_ENV === 'test' || env.SKIP_EMAIL_SEND === 'true') {
    return 'skipped';
  }
  const from = env.EMAIL_FROM || DEFAULT_EMAIL_FROM;

  if (nodemailerTransporter) {
    await nodemailerTransporter.sendMail({ ...message, from });
    return 'sent';
  }
  if (resend) {
    const { error: sendError } = await resend.emails.send({ ...message, from });
    // Resend は送信の失敗を例外にせず、戻り値の error で返す。失敗の種類（validation_error など）は
    // code に入れる（呼び出し元がログに出すのは例外の name と code だけ。lib/utils/sanitize-error.ts）
    if (sendError) {
      throw Object.assign(new Error(`Resend error: ${sendError.name}`), {
        code: `RESEND_${String(sendError.name)
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_')}`.slice(0, 32),
      });
    }
    return 'sent';
  }
  return 'no_provider';
}
