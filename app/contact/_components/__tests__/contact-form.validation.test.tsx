import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ContactPageContent } from '../contact-page-content';
import { created, fillValidForm } from './contact-form-test-utils';

// better-auth の client は ESM のため、実体を読み込ませずにモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  },
}));

import { authClient } from '@/lib/auth/auth-client';

const mockUseSession = authClient.useSession as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

function sentBody() {
  return JSON.parse(mockFetch.mock.calls[0][1].body);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseSession.mockReturnValue({ data: null, isPending: false });
});

describe('お問い合わせのフォーム: 画面での検証', () => {
  describe('入力の検証', () => {
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

  describe('最初の表示', () => {
    it('開いただけではフォーカスを動かさない', () => {
      render(<ContactPageContent signedInEmail={null} />);

      expect(
        screen.getByRole('radio', { name: '機能の要望' })
      ).not.toHaveFocus();
      expect(document.body).toHaveFocus();
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
        'input[name="hp_field"]'
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
      mockFetch.mockResolvedValue(created());
      const { container } = render(<ContactPageContent signedInEmail={null} />);

      fireEvent.change(container.querySelector('input[name="hp_field"]')!, {
        target: { value: 'http://spam.example' },
      });
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: '送信する' }));

      await screen.findByRole('heading', { name: '送信しました' });
      expect(sentBody().website).toBe('http://spam.example');
    });
  });
});
