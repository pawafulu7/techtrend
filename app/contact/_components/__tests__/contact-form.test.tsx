import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ContactPageContent } from '../contact-page-content';

// better-auth の client は ESM のため、実体を読み込ませずにモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  },
}));

import { authClient } from '@/lib/auth/auth-client';

const mockUseSession = authClient.useSession as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

function apiResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {}
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (name: string) => headers[name] ?? null },
  };
}

function signedIn(email = 'account@example.com') {
  mockUseSession.mockReturnValue({
    data: { user: { id: 'u1', email } },
    isPending: false,
  });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: '機能の要望' }));
  await user.type(
    screen.getByRole('textbox', { name: '内容' }),
    'ダークモードの切り替えをキーボードでしたい'
  );
}

function sentBody() {
  return JSON.parse(mockFetch.mock.calls[0][1].body);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseSession.mockReturnValue({ data: null, isPending: false });
});

describe('お問い合わせのフォーム', () => {
  describe('画面での検証', () => {
    it('種別を選ばずに送ると、種別のエラーを出して種別にフォーカスする', async () => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await user.type(screen.getByRole('textbox', { name: '内容' }), 'あ');
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('種別を選んでください')
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '機能の要望' })).toHaveFocus();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('何も入れずに送ると、最初の誤り（種別）にフォーカスする', async () => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('内容を書いてください')
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '機能の要望' })).toHaveFocus();
    });

    it.each([
      ['空白だけ', '   \n\t  '],
      ['制御文字だけ', '\u0000\u0007'],
    ])('本文が%sなら送らない', async (_label, message) => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await user.click(screen.getByRole('radio', { name: 'その他' }));
      fireEvent.change(screen.getByRole('textbox', { name: '内容' }), {
        target: { value: message },
      });
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('内容を書いてください')
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('本文が上限を超えたら送らず、文字数は正規化した後の値で数える', async () => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await user.click(screen.getByRole('radio', { name: 'その他' }));
      fireEvent.change(screen.getByRole('textbox', { name: '内容' }), {
        target: { value: `  ${'あ'.repeat(5001)}\r\n` },
      });

      expect(screen.getByText('5001 / 5000')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('5000 文字以内で書いてください')
      ).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('メールの形式が不正なら送らない', async () => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.type(
        screen.getByRole('textbox', { name: '返信先のメールアドレス（任意）' }),
        'not-an-email'
      );
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText('メールアドレスの形式を確かめてください')
      ).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('種別に合わせて本文の補足が変わる', async () => {
      const user = userEvent.setup();
      render(<ContactPageContent signedInEmail={null} />);

      await user.click(screen.getByRole('radio', { name: '不具合の報告' }));

      expect(
        screen.getByRole('textbox', { name: '内容' })
      ).toHaveAccessibleDescription(
        expect.stringContaining(
          '起きたこと・開いていた画面・期待した動きを書いてください'
        )
      );
    });
  });

  describe('送信', () => {
    it('未ログインで送ると、本文と返信先を送り、完了表示に切り替えて見出しにフォーカスする', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.type(
        screen.getByRole('textbox', { name: '返信先のメールアドレス（任意）' }),
        'reply@example.com'
      );
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
        message: 'ダークモードの切り替えをキーボードでしたい',
        contactEmail: 'reply@example.com',
        website: '',
      });
    });

    it('返信先が無ければ、個別に連絡しないと伝える', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
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
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
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

    it('送信中は aria-disabled にし、続けて押しても1回しか送らない', async () => {
      const user = userEvent.setup();
      let resolve: (value: unknown) => void = () => {};
      mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      const sending = await screen.findByRole('button', { name: '送信中…' });
      expect(sending).toHaveAttribute('aria-disabled', 'true');
      expect(sending).not.toBeDisabled();
      await user.click(sending);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolve(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
      expect(
        await screen.findByRole('heading', { name: '送信しました' })
      ).toBeInTheDocument();
    });
  });

  describe('送信の失敗', () => {
    it('400 なら該当の項目にエラーを出してフォーカスする', async () => {
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
      // 入力は消さない
      expect(screen.getByRole('textbox', { name: '内容' })).toHaveValue(
        'ダークモードの切り替えをキーボードでしたい'
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

    it('通信に失敗したら入力を残して、もう一度送るよう伝える', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      render(<ContactPageContent signedInEmail={null} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '送信できませんでした。時間をおいてもう一度送ってください'
      );
      expect(
        screen.getByRole('button', { name: '送信する' })
      ).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('ログイン中', () => {
    it('返信先の欄を出さず、アカウントとして送ることを示し、返信先を送らない', async () => {
      const user = userEvent.setup();
      signedIn();
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: true } })
      );
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(
        screen.queryByRole('textbox', {
          name: '返信先のメールアドレス（任意）',
        })
      ).not.toBeInTheDocument();
      expect(screen.getByText('account@example.com')).toBeInTheDocument();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      await screen.findByRole('heading', { name: '送信しました' });
      expect(sentBody()).not.toHaveProperty('contactEmail');
      expect(
        screen.getByText('内容を確認して、必要なときはご連絡します。')
      ).toBeInTheDocument();
    });

    it('hydration の後にログアウト状態なら、返信先の欄を出す', () => {
      render(<ContactPageContent signedInEmail="account@example.com" />);

      expect(
        screen.getByRole('textbox', { name: '返信先のメールアドレス（任意）' })
      ).toBeInTheDocument();
    });

    it('送信時にログインが切れていたら、そのことを完了表示で伝える', async () => {
      const user = userEvent.setup();
      signedIn();
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
      render(<ContactPageContent signedInEmail="account@example.com" />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      expect(
        await screen.findByText(
          'ログインが切れていたため、アカウントに紐付けずに受け付けました。受け付けました。返信先が無いため、個別のご連絡はしません。'
        )
      ).toBeInTheDocument();
    });
  });

  describe('bot 避けの隠し項目', () => {
    it('読み上げにも出ず、Tab でも止まらない', async () => {
      const user = userEvent.setup();
      const { container } = render(<ContactPageContent signedInEmail={null} />);

      expect(
        screen.queryByRole('textbox', {
          name: 'この欄は空のままにしてください',
        })
      ).not.toBeInTheDocument();

      const honeypot = container.querySelector<HTMLInputElement>(
        'input[name="hp_url"]'
      );
      expect(honeypot).toHaveAttribute('tabindex', '-1');
      expect(honeypot).toHaveAttribute('autocomplete', 'off');

      for (let i = 0; i < 10; i += 1) {
        await user.tab();
        expect(document.activeElement).not.toBe(honeypot);
      }
    });

    it('値が入っていれば、その値を website として送る', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        apiResponse(201, { data: { received: true, linkedToAccount: false } })
      );
      const { container } = render(<ContactPageContent signedInEmail={null} />);

      fireEvent.change(container.querySelector('input[name="hp_url"]')!, {
        target: { value: 'http://spam.example' },
      });
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      await screen.findByRole('heading', { name: '送信しました' });
      expect(sentBody().website).toBe('http://spam.example');
    });
  });
});
