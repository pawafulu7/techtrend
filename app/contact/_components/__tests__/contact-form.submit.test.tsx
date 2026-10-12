import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ContactPageContent } from '../contact-page-content';
import {
  VALID_MESSAGE,
  apiResponse,
  created,
  fillValidForm,
} from './contact-form-test-utils';

// better-auth の client は ESM のため、実体を読み込ませずにモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  },
}));

import { authClient } from '@/lib/auth/auth-client';

const mockUseSession = authClient.useSession as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

function signedIn(user: Record<string, unknown> = {}) {
  mockUseSession.mockReturnValue({
    data: { user: { id: 'u1', email: 'account@example.com', ...user } },
    isPending: false,
  });
}

function sentBody(call = 0) {
  return JSON.parse(mockFetch.mock.calls[call][1].body);
}

const emailBox = () =>
  screen.queryByRole('textbox', { name: '返信先のメールアドレス（任意）' });

beforeEach(() => {
  mockFetch.mockReset();
  mockUseSession.mockReturnValue({ data: null, isPending: false });
});

describe('お問い合わせのフォーム: 送信', () => {
  describe('送る', () => {
    it('未ログインで送ると、本文と返信先を送り、完了表示に切り替えて見出しにフォーカスする', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(created({ reply: true }));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.type(emailBox()!, 'reply@example.com');
      await user.click(screen.getByRole('button', { name: '送信する' }));

      const heading = await screen.findByRole('heading', {
        name: '送信しました',
      });
      expect(heading).toHaveFocus();
      expect(
        screen.getByText('内容を確認して、必要なときはご連絡します。')
      ).toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/inquiries',
        expect.objectContaining({ method: 'POST' })
      );
      expect(sentBody()).toEqual({
        category: 'FEATURE_REQUEST',
        message: VALID_MESSAGE,
        contactEmail: 'reply@example.com',
        website: '',
      });
    });

    it('本文は画面で数えたのと同じ、正規化した値で送る', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(created());
      render(<ContactPageContent signedInEmail={null} />);

      await user.click(screen.getByRole('radio', { name: 'その他' }));
      await user.type(
        screen.getByRole('textbox', { name: '内容' }),
        '   前後の空白は送らない   '
      );
      await user.click(screen.getByRole('button', { name: '送信する' }));

      await screen.findByRole('heading', { name: '送信しました' });
      expect(sentBody().message).toBe('前後の空白は送らない');
    });

    it('返信先が無ければ、個別に連絡しないと伝える', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(created());
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText(
          '受け付けました。返信先が無いため、個別のご連絡はしません。'
        )
      ).toBeInTheDocument();
    });

    it('「続けて送る」で空のフォームに戻り、種別にフォーカスする', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(created());
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));
      await user.click(
        await screen.findByRole('button', { name: '続けて送る' })
      );

      expect(screen.getByRole('textbox', { name: '内容' })).toHaveValue('');
      expect(
        screen.getByRole('radio', { name: '機能の要望' })
      ).not.toBeChecked();
      await waitFor(() =>
        expect(screen.getByRole('radio', { name: '機能の要望' })).toHaveFocus()
      );
    });

    it('送信中は aria-disabled と入力の読み取り専用にし、続けて押しても1回しか送らない', async () => {
      const user = userEvent.setup();
      let resolve: (value: unknown) => void = () => {};
      mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      const sending = await screen.findByRole('button', { name: '送信中…' });
      expect(sending).toHaveAttribute('aria-disabled', 'true');
      expect(sending).not.toBeDisabled();
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveAttribute(
        'readonly'
      );
      expect(emailBox()).toHaveAttribute('readonly');
      await user.click(sending);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolve(created());
      expect(
        await screen.findByRole('heading', { name: '送信しました' })
      ).toBeInTheDocument();
    });
  });

  describe('送信の失敗', () => {
    it('400 なら該当の項目にエラーを出してフォーカスし、入力は残す', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(400, {
          error: { code: 'VALIDATION_ERROR', field: 'message' },
        })
      );
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('内容を確かめてください')
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveFocus();
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveValue(
        VALID_MESSAGE
      );
    });

    it('400 の項目名が知らないもの（プロトタイプの名前を含む）なら、全体のエラーにする', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(400, {
          error: { code: 'VALIDATION_ERROR', field: 'constructor' },
        })
      );
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '送信できませんでした。時間をおいてもう一度送ってください'
      );
    });

    it('429 なら Retry-After を分に直して待つ時間を出す', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(429, {}, { 'Retry-After': '120' })
      );
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '送信が続いたため受け付けを止めています。約 2 分後にもう一度送ってください'
      );
    });

    it('429 で Retry-After が無ければ「しばらくしてから」と出す', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(apiResponse(429));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'しばらくしてからもう一度送ってください'
      );
    });

    it('413 なら短くするよう伝える', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(apiResponse(413));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '内容が長すぎます。短くしてから送ってください'
      );
    });

    it('失敗の後にもう一度押すと、エラーを消してもう1回送る', async () => {
      const user = userEvent.setup();
      const failed = '送信できませんでした。時間をおいてもう一度送ってください';
      let resolve: (value: unknown) => void = () => {};
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockReturnValueOnce(new Promise((r) => (resolve = r)));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByText(failed)).toBeInTheDocument();
      const button = screen.getByRole('button', { name: '送信する' });
      expect(button).not.toHaveAttribute('aria-disabled');
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveValue(
        VALID_MESSAGE
      );

      await user.click(button);

      // 2回目を送っている間に、前のエラーは消えている
      expect(
        await screen.findByRole('button', { name: '送信中…' })
      ).toBeInTheDocument();
      expect(screen.queryByText(failed)).not.toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      resolve(created());
      expect(
        await screen.findByRole('heading', { name: '送信しました' })
      ).toBeInTheDocument();
    });
  });

  describe('ログイン中', () => {
    it('返信先の欄を出さず、アカウントとして送ることを示し、返信先を送らない', async () => {
      const user = userEvent.setup();
      signedIn();
      mockFetch.mockResolvedValue(created({ linked: true, reply: true }));
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(emailBox()).not.toBeInTheDocument();
      expect(screen.getByText('account@example.com')).toBeInTheDocument();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      await screen.findByRole('heading', { name: '送信しました' });
      expect(sentBody()).not.toHaveProperty('contactEmail');
      expect(
        screen.getByText('内容を確認して、必要なときはご連絡します。')
      ).toBeInTheDocument();
    });

    it('セッションを確かめている間は、Server の判定（ログイン中）を使う', () => {
      mockUseSession.mockReturnValue({ data: null, isPending: true });
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(emailBox()).not.toBeInTheDocument();
      expect(screen.getByText('account@example.com')).toBeInTheDocument();
    });

    it('セッションの取得に失敗したら、Server の判定を使い続ける', () => {
      mockUseSession.mockReturnValue({
        data: null,
        isPending: false,
        error: new Error('network'),
      });
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(emailBox()).not.toBeInTheDocument();
    });

    it('確かめた結果ログアウトしていれば、返信先の欄を出す', () => {
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(emailBox()).toBeInTheDocument();
    });

    it('退会済みのセッションは未ログインとして扱う', () => {
      signedIn({ deletedAt: '2026-10-01T00:00:00.000Z' });
      render(<ContactPageContent signedInEmail={null} />);

      expect(emailBox()).toBeInTheDocument();
    });

    it('送信時にログインが切れていて返信先も無ければ、そのことを完了表示で伝える', async () => {
      const user = userEvent.setup();
      signedIn();
      mockFetch.mockResolvedValue(created());
      render(<ContactPageContent signedInEmail="account@example.com" />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText(
          'ログインが切れていたため、アカウントに紐付けずに受け付けました。受け付けました。返信先が無いため、個別のご連絡はしません。'
        )
      ).toBeInTheDocument();
    });

    it('紐付けは外れても返信先が残っていれば、連絡すると伝える', async () => {
      const user = userEvent.setup();
      signedIn();
      mockFetch.mockResolvedValue(created({ linked: false, reply: true }));
      render(<ContactPageContent signedInEmail="account@example.com" />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('内容を確認して、必要なときはご連絡します。')
      ).toBeInTheDocument();
    });
  });
});
