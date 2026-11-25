/**
 * lib/auth/auth.ts の確認メール（emailVerification.sendVerificationEmail）
 *
 * Better Auth は設定をそのまま返す形に差し替え、設定に渡した関数を直接呼ぶ。
 * 送信そのもの（Gmail・SMTP・Resend）は __tests__/lib/email/mailer.test.ts
 */
import type { EmailMessage, SendEmailResult } from '@/lib/email/mailer';

jest.mock('better-auth', () => ({
  betterAuth: (options: unknown) => ({ options }),
}));
jest.mock('@better-auth/prisma-adapter', () => ({ prismaAdapter: () => ({}) }));
jest.mock('better-auth/plugins', () => ({ admin: () => ({}) }));
jest.mock('next/server', () => ({ after: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/auth/rate-limit-storage', () => ({
  betterAuthRateLimitStorage: {},
}));

jest.mock('@/lib/logger', () => {
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { __esModule: true, default: log, logger: log };
});

const mockEnv: Record<string, unknown> = {
  NODE_ENV: 'production',
  PORT: '3000',
};
jest.mock('@/lib/config/env', () => ({ env: mockEnv }));

const mockSendEmail = jest.fn<Promise<SendEmailResult>, [EmailMessage]>();
jest.mock('@/lib/email/mailer', () => ({
  sendEmail: (message: EmailMessage) => mockSendEmail(message),
}));

// eslint-disable-next-line import/first
import logger from '@/lib/logger';

// jest.setup.node.js が認証のモジュールごとモックにしているので、このテストだけ本物を読む
const { auth } = jest.requireActual<typeof import('@/lib/auth/auth')>('@/lib/auth/auth');

const mockLogger = logger as unknown as Record<
  'info' | 'warn' | 'error',
  jest.Mock
>;

type SendVerificationEmail = (data: {
  user: { email: string };
  url: string;
  token: string;
}) => Promise<void>;

const sendVerificationEmail = (
  auth as unknown as {
    options: {
      emailVerification: { sendVerificationEmail: SendVerificationEmail };
    };
  }
).options.emailVerification.sendVerificationEmail;

const URL_IN_MAIL =
  'https://techtrend.example.com/api/auth/verify-email?token=abc&callbackURL=%2F';
const DATA = {
  user: { email: 'new-user@example.com' },
  url: URL_IN_MAIL,
  token: 'abc',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.NODE_ENV = 'production';
  mockSendEmail.mockResolvedValue('sent');
});

describe('sendVerificationEmail', () => {
  it('sends the verification link to the new address', async () => {
    await expect(sendVerificationEmail(DATA)).resolves.toBeUndefined();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.to).toBe('new-user@example.com');
    expect(message.subject).toBe('TechTrend - メールアドレスの確認');
    // リンク先の & は、属性値として &amp; にする
    expect(message.html).toContain(
      '<a href="https://techtrend.example.com/api/auth/verify-email?token=abc&amp;callbackURL=%2F"'
    );
    // ホスト名がメールソフトで勝手にリンクにならないよう、ドットの前にゼロ幅の空白を入れる
    expect(message.html).toContain(
      '<strong>techtrend&#8203;.example&#8203;.com</strong>'
    );
    expect(message.html).toContain('リンクは24時間有効です。');
    expect(message.text).toContain(URL_IN_MAIL);
    expect(message.text).toContain(
      'techtrend.example.com へのサインインを完了するには'
    );
  });

  it('does nothing more when this environment does not send email', async () => {
    mockSendEmail.mockResolvedValue('skipped');
    await expect(sendVerificationEmail(DATA)).resolves.toBeUndefined();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('rethrows when sending fails', async () => {
    // SMTP のエラーの文には宛先や接続先が入る。ログには種類とコードだけを出す
    mockSendEmail.mockRejectedValue(
      Object.assign(new Error('550 rejected new-user@example.com at 10.0.0.1'), {
        code: 'EENVELOPE',
      })
    );
    // 投げ直す例外も、種類とコードだけにする（Better Auth がそのままログに出すため）
    const thrown = await sendVerificationEmail(DATA).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('EENVELOPE');
    expect(String((thrown as Error).message)).not.toContain('new-user@example.com');
    expect(String((thrown as Error).message)).not.toContain('10.0.0.1');
    expect((thrown as Error).cause).toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { errorSummary: expect.stringContaining('EENVELOPE') },
      expect.any(String)
    );
    const logged = JSON.stringify(mockLogger.error.mock.calls);
    expect(logged).not.toContain('new-user@example.com');
    expect(logged).not.toContain('10.0.0.1');
  });

  it('throws in production when no email provider is configured', async () => {
    mockSendEmail.mockResolvedValue('no_provider');
    await expect(sendVerificationEmail(DATA)).rejects.toThrow(
      'No email provider configured'
    );
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('only warns in development when no email provider is configured', async () => {
    mockEnv.NODE_ENV = 'development';
    mockSendEmail.mockResolvedValue('no_provider');
    await expect(sendVerificationEmail(DATA)).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'No email provider configured'
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
