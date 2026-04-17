import { render, act } from '@testing-library/react';
import { ViewTracker } from '@/components/article/view-tracker';
import { authClient } from '@/lib/auth/auth-client';

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
  useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
}));

const mockedUseSession = jest.mocked(authClient.useSession);

const ARTICLE_ID = 'article-123';
const API_URL = '/api/article-views';

describe('ViewTracker', () => {
  let consoleErrorSpy: jest.SpyInstance;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1' }, session: {} },
      isPending: false,
    } as any);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ viewId: 'view-1' }),
    });

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('records view after 1500ms when authenticated', async () => {
    render(<ViewTracker articleId={ARTICLE_ID} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: ARTICLE_ID }),
      })
    );
  });

  it('does not fetch when unauthenticated (session is null)', () => {
    mockedUseSession.mockReturnValue({ data: null, isPending: false } as any);

    render(<ViewTracker articleId={ARTICLE_ID} />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when session has no user id', () => {
    mockedUseSession.mockReturnValue({
      data: { session: {} },
      isPending: false,
    } as any);

    render(<ViewTracker articleId={ARTICLE_ID} />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when unmounted before 1500ms delay', () => {
    const { unmount } = render(<ViewTracker articleId={ARTICLE_ID} />);

    act(() => {
      jest.advanceTimersByTime(500);
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-evaluates when session becomes available after initial render', async () => {
    mockedUseSession.mockReturnValue({ data: null, isPending: false } as any);
    const { rerender } = render(<ViewTracker articleId={ARTICLE_ID} />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(global.fetch).not.toHaveBeenCalled();

    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1' }, session: {} },
      isPending: false,
    } as any);
    rerender(<ViewTracker articleId={ARTICLE_ID} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });

    expect(global.fetch).toHaveBeenCalledWith(API_URL, expect.any(Object));
  });
});
