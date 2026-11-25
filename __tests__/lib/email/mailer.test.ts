/**
 * lib/email/mailer.ts - 送信の設定の選び方と、送らない設定・失敗の扱い
 *
 * 送信の設定はモジュールを読んだ時点の環境変数で決まるので、テストごとにモジュールを読み直す。
 */
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn((_options: unknown) => ({
  sendMail: mockSendMail,
}));
jest.mock('nodemailer', () => ({
  createTransport: (options: unknown) => mockCreateTransport(options),
}));

const mockResendSend = jest.fn();
const mockResendConstructor = jest.fn();
jest.mock('resend', () => ({
  Resend: function Resend(apiKey: string) {
    mockResendConstructor(apiKey);
    return { emails: { send: (message: unknown) => mockResendSend(message) } };
  },
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

const mockEnv: Record<string, unknown> = {};
jest.mock('@/lib/config/env', () => ({ env: mockEnv }));

type Mailer = typeof import('@/lib/email/mailer');

function loadMailer(values: Record<string, unknown>): Mailer {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, {
    SKIP_EMAIL_SEND: 'false',
    SMTP_PORT: 587,
    SMTP_SECURE: 'false',
    ...values,
  });
  let mailer!: Mailer;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mailer = require('@/lib/email/mailer');
  });
  return mailer;
}

const MESSAGE = {
  to: 'friend@gmail.com',
  subject: '件名',
  html: '<p>本文</p>',
  text: '本文',
};

const GMAIL = {
  GMAIL_USER: 'sender@gmail.com',
  GMAIL_APP_PASSWORD: 'app-password',
};

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: 'm1' });
  mockResendSend.mockResolvedValue({ data: { id: 'r1' }, error: null });
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
});

afterAll(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV =
    originalNodeEnv;
});

describe('sendEmail', () => {
  it('sends through Gmail when the Gmail account is configured', async () => {
    const { sendEmail } = loadMailer({
      ...GMAIL,
      EMAIL_FROM: 'TechTrend <sender@gmail.com>',
    });
    await expect(sendEmail(MESSAGE)).resolves.toBe('sent');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'sender@gmail.com', pass: 'app-password' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'TechTrend <sender@gmail.com>',
      ...MESSAGE,
    });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sends through SMTP when only the SMTP host is configured', async () => {
    const { sendEmail } = loadMailer({
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
    });
    await expect(sendEmail(MESSAGE)).resolves.toBe('sent');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'smtp-user', pass: 'smtp-password' },
    });
    // EMAIL_FROM が無ければ既定の差出人
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@techtrend.example.com',
      ...MESSAGE,
    });
  });

  it('connects over TLS without credentials when SMTP is configured that way', async () => {
    const { sendEmail } = loadMailer({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_SECURE: 'true',
    });
    await expect(sendEmail(MESSAGE)).resolves.toBe('sent');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: undefined,
    });
  });

  it('does not let the message override the sender', async () => {
    const { sendEmail } = loadMailer({ ...GMAIL, EMAIL_FROM: 'sender@gmail.com' });
    await sendEmail({ ...MESSAGE, from: 'attacker@example.com' } as typeof MESSAGE);
    expect(mockSendMail).toHaveBeenCalledWith({ ...MESSAGE, from: 'sender@gmail.com' });
  });

  it('sends through Resend when neither Gmail nor SMTP is configured', async () => {
    const { sendEmail } = loadMailer({ RESEND_API_KEY: 're_test' });
    await expect(sendEmail(MESSAGE)).resolves.toBe('sent');
    expect(mockResendConstructor).toHaveBeenCalledWith('re_test');
    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'noreply@techtrend.example.com',
      ...MESSAGE,
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('prefers Gmail over Resend when both are configured', async () => {
    const { sendEmail } = loadMailer({ ...GMAIL, RESEND_API_KEY: 're_test' });
    await expect(sendEmail(MESSAGE)).resolves.toBe('sent');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('throws when the SMTP transport fails', async () => {
    mockSendMail.mockRejectedValue(new Error('Invalid login'));
    const { sendEmail } = loadMailer(GMAIL);
    await expect(sendEmail(MESSAGE)).rejects.toThrow('Invalid login');
  });

  it('throws when Resend reports an error in its return value', async () => {
    // Resend は送信の失敗を例外にせず、戻り値の error で返す
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'bad address friend@gmail.com',
      },
    });
    const { sendEmail } = loadMailer({ RESEND_API_KEY: 're_test' });
    // 失敗の種類は code に入れる（呼び出し元がログに出すのは name と code だけ）
    await expect(sendEmail(MESSAGE)).rejects.toMatchObject({
      message: 'Resend error: validation_error',
      code: 'RESEND_VALIDATION_ERROR',
    });
  });

  it('reports no_provider without throwing when nothing is configured', async () => {
    const { sendEmail } = loadMailer({});
    await expect(sendEmail(MESSAGE)).resolves.toBe('no_provider');
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('does not send when SKIP_EMAIL_SEND is on', async () => {
    const { sendEmail } = loadMailer({ ...GMAIL, SKIP_EMAIL_SEND: 'true' });
    await expect(sendEmail(MESSAGE)).resolves.toBe('skipped');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('does not send under NODE_ENV=test', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const { sendEmail } = loadMailer(GMAIL);
    await expect(sendEmail(MESSAGE)).resolves.toBe('skipped');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
