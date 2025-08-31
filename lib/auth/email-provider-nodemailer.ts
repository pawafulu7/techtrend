// Theme type for email template
interface Theme {
  colorScheme?: string;
  brandColor?: string;
  buttonText?: string;
}

// Email templates
function html(params: { url: string; host: string; theme?: Theme }) {
  const { url, host } = params;
  const escapedHost = host.replace(/\./g, '&#8203;.');
  
  return `
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
                      TechTrend メールアドレスの確認
                    </h1>
                    <p style="color: #666666; margin: 0 0 30px 0; font-size: 16px; line-height: 1.5;">
                      <strong>${escapedHost}</strong> へのサインインを完了するには、<br>
                      以下のボタンをクリックしてください。
                    </p>
                    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td style="background-color: #0070f3; border-radius: 6px;">
                          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500;">
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
                <tr>
                  <td style="padding: 20px 30px; background-color: #f8f8f8; border-top: 1px solid #e0e0e0; text-align: center; border-radius: 0 0 8px 8px;">
                    <p style="color: #999999; margin: 0; font-size: 12px;">
                      このメールは自動送信されています。返信はできません。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function text({ url, host }: { url: string; host: string }) {
  return `TechTrend メールアドレスの確認

${host} へのサインインを完了するには、以下のリンクをクリックしてください：

${url}

このメールに心当たりがない場合は、無視してください。
リンクは24時間有効です。

このメールは自動送信されています。
`;
}

export interface SendVerificationRequestParams {
  identifier: string;
  url: string;
  expires: Date;
  provider: {
    server?: unknown;
    from?: string;
    maxAge?: number;
  };
  theme?: Theme;
  token: string;
  request: Request;
}

// Create transporter based on environment
function createTransporter() {
  // nodemailerを関数内で動的にインポート
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodemailer: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodemailer = require('nodemailer');
  } catch (_error) {
    return null;
  }
  
  // Gmail設定（アプリパスワードが必要）
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({  // createTransporter → createTransport に修正
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  
  // カスタムSMTP設定
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    return nodemailer.createTransport({  // createTransporter → createTransport に修正
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      } : undefined,
    });
  }
  
  // テスト用（Ethereal Email）
  if (process.env.NODE_ENV === 'development') {
    // Etherealは実際にはメールを送信しませんが、プレビューできます
    return nodemailer.createTransport({  // createTransporter → createTransport に修正
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal.pass',
      },
    });
  }
  
  return null;
}

export async function sendVerificationRequestNodemailer(params: SendVerificationRequestParams) {
  const { identifier: to, url, provider } = params;
  const { host } = new URL(url);
  const from = provider.from || process.env.EMAIL_FROM || 'noreply@techtrend.example.com';

  // Development mode - skip only if explicitly requested AND no Gmail configured
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_EMAIL_SEND === 'true' && !process.env.GMAIL_USER) {
    return;
  }

  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error('Email configuration is missing');
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'TechTrend - メールアドレスの確認',
      html: html({ url, host, theme: params.theme }),
      text: text({ url, host }),
    });

    
    // Etherealの場合、プレビューURLを表示（nodemailerを再度requireする必要がある）
    if (info.messageId && process.env.NODE_ENV === 'development') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodemailer = require('nodemailer');
        if (nodemailer.getTestMessageUrl) {
        }
      } catch (_error) {
        // nodemailer not available, skip preview URL
      }
    }
  } catch (error) {
    throw new Error('Failed to send verification email');
  }
}