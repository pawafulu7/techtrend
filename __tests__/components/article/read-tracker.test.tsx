import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReadTracker } from '@/components/article/read-tracker';
import { useSession } from '@/lib/auth/auth-client';

// Mock @/lib/auth/auth-client
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

// Mock logger
jest.mock('@/lib/logger.client', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const READ_STATUS_STORAGE_KEY = 'techtrend-read-articles';
const ARTICLE_ID = 'article-123';
const API_URL = '/api/articles/read-status';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderReadTracker(
  queryClient: QueryClient,
  articleId: string = ARTICLE_ID
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ReadTracker articleId={articleId} />, { wrapper: Wrapper });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ReadTracker', () => {
  let queryClient: QueryClient;
  let dispatchEventSpy: jest.SpyInstance;
  let originalSendBeacon: typeof navigator.sendBeacon;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    queryClient = createQueryClient();

    // Default: authenticated session
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    // Mock sendBeacon
    originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = jest.fn().mockReturnValue(true);

    // Spy on dispatchEvent
    dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

    // Mock localStorage
    const store: Record<string, string> = {};
    jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation((key: string) => store[key] ?? null);
    jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation((key: string, value: string) => {
        store[key] = value;
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    navigator.sendBeacon = originalSendBeacon;
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Normal flow: 3-second delay marks as read
  // -------------------------------------------------------------------------
  it('marks article as read after 3-second delay', async () => {
    const setQueriesDataSpy = jest.spyOn(queryClient, 'setQueriesData');

    renderReadTracker(queryClient);

    // Advance past the 3-second delay
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Wait for the fetch promise to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Verify fetch was called with correct URL and body
    expect(global.fetch).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: ARTICLE_ID }),
      })
    );

    // Verify optimistic updates
    expect(setQueriesDataSpy).toHaveBeenCalled();
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'article-read-status-changed',
        detail: { articleId: ARTICLE_ID, isRead: true },
      })
    );
    expect(localStorage.setItem).toHaveBeenCalledWith(
      READ_STATUS_STORAGE_KEY,
      expect.stringContaining(ARTICLE_ID)
    );
  });

  // -------------------------------------------------------------------------
  // 2. Unmount before 3 seconds: sendBeacon fires
  // -------------------------------------------------------------------------
  it('fires sendBeacon on unmount before 3-second delay', () => {
    const setQueriesDataSpy = jest.spyOn(queryClient, 'setQueriesData');

    const { unmount } = renderReadTracker(queryClient);

    // Unmount immediately (no timer advance)
    unmount();

    // Verify sendBeacon was called
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      API_URL,
      expect.any(Blob)
    );

    // Verify the Blob content
    const blobArg = (navigator.sendBeacon as jest.Mock).mock
      .calls[0][1] as Blob;
    expect(blobArg.type).toBe('application/json');

    // Verify optimistic updates were applied
    expect(setQueriesDataSpy).toHaveBeenCalled();
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'article-read-status-changed',
        detail: { articleId: ARTICLE_ID, isRead: true },
      })
    );
    expect(localStorage.setItem).toHaveBeenCalledWith(
      READ_STATUS_STORAGE_KEY,
      expect.stringContaining(ARTICLE_ID)
    );
  });

  // -------------------------------------------------------------------------
  // 3. Unmount before 3 seconds: fetch keepalive fallback when sendBeacon
  //    returns false
  // -------------------------------------------------------------------------
  it('falls back to fetch keepalive when sendBeacon returns false', () => {
    (navigator.sendBeacon as jest.Mock).mockReturnValue(false);
    const setQueriesDataSpy = jest.spyOn(queryClient, 'setQueriesData');

    const { unmount } = renderReadTracker(queryClient);
    unmount();

    // sendBeacon was called but returned false
    expect(navigator.sendBeacon).toHaveBeenCalled();

    // Fallback fetch with keepalive
    expect(global.fetch).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: ARTICLE_ID }),
        keepalive: true,
      })
    );

    // Verify optimistic updates were applied
    expect(setQueriesDataSpy).toHaveBeenCalled();
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'article-read-status-changed',
      })
    );
  });

  // -------------------------------------------------------------------------
  // 4. Unmount before 3 seconds: fetch keepalive fallback when sendBeacon
  //    is unavailable
  // -------------------------------------------------------------------------
  it('falls back to fetch keepalive when sendBeacon is unavailable', () => {
    // Remove sendBeacon entirely
    Object.defineProperty(navigator, 'sendBeacon', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { unmount } = renderReadTracker(queryClient);
    unmount();

    // Fallback fetch with keepalive
    expect(global.fetch).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      })
    );
  });

  // -------------------------------------------------------------------------
  // 5. Unmount after successful fetch: sendBeacon NOT called
  // -------------------------------------------------------------------------
  it('does not fire sendBeacon after successful fetch', async () => {
    const { unmount } = renderReadTracker(queryClient);

    // Advance past the 3-second delay
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Wait for fetch to resolve and hasSentRequest to become true
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reset sendBeacon mock to track only post-unmount calls
    (navigator.sendBeacon as jest.Mock).mockClear();

    unmount();

    // sendBeacon should NOT be called because hasSentRequest is true
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. No beacon when unauthenticated
  // -------------------------------------------------------------------------
  it('does not fire sendBeacon or fetch when unauthenticated', () => {
    (useSession as jest.Mock).mockReturnValue({ data: null, isPending: false });

    const { unmount } = renderReadTracker(queryClient);
    unmount();

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Fetch in-progress on unmount: sendBeacon still fires
  // -------------------------------------------------------------------------
  it('fires sendBeacon on unmount while fetch is still in-progress', () => {
    // Make fetch hang (never resolve)
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));

    const { unmount } = renderReadTracker(queryClient);

    // Advance past the 3-second delay — fetch starts but never resolves
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Unmount before fetch resolves
    unmount();

    // sendBeacon should fire because hasSentRequest is still false
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      API_URL,
      expect.any(Blob)
    );
  });
});
