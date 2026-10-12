/**
 * 送信フォームのテストの共通部品（*.test.tsx ではないので、これ自体はテストとして走らない）
 */
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

export function apiResponse(
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

/** 201 の応答。linked はアカウントに紐付いたか、reply は返信先を残したか */
export function created({ linked = false, reply = false } = {}) {
  return apiResponse(201, {
    data: { received: true, linkedToAccount: linked, hasReplyChannel: reply },
  });
}

export const VALID_MESSAGE = 'ダークモードの切り替えをキーボードでしたい';

export async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: '機能の要望' }));
  await user.type(screen.getByRole('textbox', { name: '内容' }), VALID_MESSAGE);
}
