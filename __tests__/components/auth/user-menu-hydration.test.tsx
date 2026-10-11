/**
 * UserMenu の hydration（issue #714）。
 *
 * authClient.useSession() は hydration 中にもその時点の値を返す。hydration の前に
 * セッションの判定が済むと、サーバー描画（判定中のスピナー）と食い違い、React は
 * 表示を直さない。hydration 中はサーバーと同じ表示にし、その後に判定の結果を出す。
 */

import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { UserMenu } from '@/components/auth/UserMenu';

const mockUseSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: jest.fn(),
  },
}));

describe('UserMenu の hydration', () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
  });

  it('判定済みのセッションで hydrate しても食い違わず、その後にログインのリンクを出す', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const html = renderToString(<UserMenu />);
    expect(html).not.toContain('ログイン');

    // hydrate する前にセッションの判定が済んでいる（ゲスト）
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await act(async () => {
        root = hydrateRoot(container, <UserMenu />, {
          onRecoverableError: (error) => console.error(error),
        });
      });

      const hydrationErrors = consoleError.mock.calls.filter((args) =>
        String(args[0]).toLowerCase().includes('hydrat')
      );
      expect(hydrationErrors).toEqual([]);
      expect(container.textContent).toContain('ログイン');
    } finally {
      consoleError.mockRestore();
    }
  });
});
