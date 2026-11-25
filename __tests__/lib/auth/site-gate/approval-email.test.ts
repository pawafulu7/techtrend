/**
 * lib/auth/site-gate/approval-email.ts - 利用の申請を許可した知らせのメール
 *
 * 送信そのもの（Gmail・SMTP・Resend）は __tests__/lib/email/mailer.test.ts
 */
import type { EmailMessage, SendEmailResult } from '@/lib/email/mailer';

jest.mock('@/lib/logger', () => {
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { __esModule: true, default: log, logger: log };
});

const mockSendEmail = jest.fn<Promise<SendEmailResult>, [EmailMessage]>();
jest.mock('@/lib/email/mailer', () => ({
  sendEmail: (message: EmailMessage) => mockSendEmail(message),
}));

// eslint-disable-next-line import/first
import logger from '@/lib/logger';
// eslint-disable-next-line import/first
import {
  GATE_APPROVAL_EMAIL_TIMEOUT_MS,
  sendGateApprovalEmail,
} from '@/lib/auth/site-gate/approval-email';

const mockLogger = logger as unknown as Record<
  'info' | 'warn' | 'error',
  jest.Mock
>;

const ORIGIN = 'https://techtrend.example.com';

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue('sent');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('sendGateApprovalEmail', () => {
  it('sends the notice to the approved address with a link to the site', async () => {
    await expect(
      sendGateApprovalEmail('friend@gmail.com', ORIGIN)
    ).resolves.toBe('sent');

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.to).toBe('friend@gmail.com');
    expect(message.subject).toBe('TechTrend - 利用の申請が許可されました');
    expect(message.html).toContain(`<a href="${ORIGIN}/"`);
    expect(message.html).toContain('TechTrend の利用が許可されました');
    expect(message.text).toContain(`${ORIGIN}/`);
    expect(message.text).toContain('TechTrend の利用が許可されました');
  });

  it('does not put the address in the body (it is stored without dots, unlike what the person typed)', async () => {
    await sendGateApprovalEmail('tarosuzuki@gmail.com', ORIGIN);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.html).not.toContain('tarosuzuki');
    expect(message.text).not.toContain('tarosuzuki');
  });

  it('escapes the site URL in the HTML', async () => {
    await sendGateApprovalEmail(
      'friend@gmail.com',
      'https://a.example.com"><b>&'
    );
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.html).toContain(
      'href="https://a.example.com&quot;&gt;&lt;b&gt;&amp;/"'
    );
    expect(message.html).not.toContain('"><b>');
  });

  it('logs that the notice was sent, with the address masked', async () => {
    await sendGateApprovalEmail('friend@gmail.com', ORIGIN);
    expect(mockLogger.info).toHaveBeenCalledWith(
      { email: 'f***@gmail.com' },
      expect.any(String)
    );
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(
      'friend@gmail.com'
    );
  });

  it('is "none" when this environment does not send email', async () => {
    mockSendEmail.mockResolvedValue('skipped');
    await expect(
      sendGateApprovalEmail('friend@gmail.com', ORIGIN)
    ).resolves.toBe('none');
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('is "failed" when no email provider is configured', async () => {
    mockSendEmail.mockResolvedValue('no_provider');
    await expect(
      sendGateApprovalEmail('friend@gmail.com', ORIGIN)
    ).resolves.toBe('failed');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { email: 'f***@gmail.com' },
      expect.any(String)
    );
  });

  it('is "failed" without throwing when sending fails, and keeps the address and the message out of the log', async () => {
    mockSendEmail.mockRejectedValue(
      Object.assign(new Error('550 rejected friend@gmail.com at 10.0.0.1'), {
        code: 'EENVELOPE',
      })
    );
    await expect(
      sendGateApprovalEmail('friend@gmail.com', ORIGIN)
    ).resolves.toBe('failed');
    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        errorSummary: expect.stringContaining('EENVELOPE'),
        email: 'f***@gmail.com',
      },
      expect.any(String)
    );
    const logged = JSON.stringify(mockLogger.error.mock.calls);
    expect(logged).not.toContain('friend@gmail.com');
    expect(logged).not.toContain('10.0.0.1');
  });

  it('gives up waiting after the time limit and is "failed"', async () => {
    jest.useFakeTimers();
    mockSendEmail.mockReturnValue(new Promise(() => {}));
    const pending = sendGateApprovalEmail('friend@gmail.com', ORIGIN);
    let settled: string | null = null;
    void pending.then((value) => {
      settled = value;
    });

    await jest.advanceTimersByTimeAsync(GATE_APPROVAL_EMAIL_TIMEOUT_MS - 1);
    expect(settled).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('failed');
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    // 送信の失敗と見分けられるよう、時間切れはコードで残す
    expect(mockLogger.error).toHaveBeenCalledWith(
      { errorSummary: expect.stringContaining('ETIMEDOUT'), email: 'f***@gmail.com' },
      expect.any(String)
    );
  });

  it.each([
    ['is sent', () => mockSendEmail.mockResolvedValue('sent'), 'sent'],
    ['is skipped', () => mockSendEmail.mockResolvedValue('skipped'), 'none'],
    ['has no provider', () => mockSendEmail.mockResolvedValue('no_provider'), 'failed'],
    ['fails', () => mockSendEmail.mockRejectedValue(new Error('boom')), 'failed'],
  ])('does not leave the timer running when the email %s', async (_label, arrange, expected) => {
    jest.useFakeTimers();
    arrange();
    await expect(sendGateApprovalEmail('friend@gmail.com', ORIGIN)).resolves.toBe(expected);
    expect(jest.getTimerCount()).toBe(0);
  });
});
