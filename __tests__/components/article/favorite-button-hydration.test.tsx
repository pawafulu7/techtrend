/**
 * @jest-environment jsdom
 *
 * FavoriteButton の hydration（issue #714）。
 *
 * ホームの一覧はサーバーで描き、ストリームで後から hydrate される。そのときには
 * セッションの判定が済んでいることがあり、authClient.useSession() は hydration 中でも
 * 判定済みの値を返す。サーバー描画（判定中で disabled）と食い違うと、React は属性を
 * 直さないため、ボタンが押せないまま残っていた。
 */

import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { FavoriteButton } from '@/app/components/article/favorite-button';

const mockUseSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
  },
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('FavoriteButton の hydration', () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
  });

  it('判定済みのセッションで hydrate しても、食い違わずに押せる状態になる', async () => {
    // サーバー: セッションは判定中
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const html = renderToString(<FavoriteButton articleId="a1" />);
    expect(html).toContain('disabled=""');

    // クライアント: hydrate する前にセッションの判定が済んでいる
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(container, <FavoriteButton articleId="a1" />);
    });

    const button = container.querySelector(
      '[data-testid="favorite-button"]'
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    const hydrationErrors = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('hydrat')
    );
    consoleError.mockRestore();
    expect(hydrationErrors).toEqual([]);
  });
});
