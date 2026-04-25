import { act, renderHook, waitFor } from '@testing-library/react';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';

// jsdom の location.pathname='/' から導出される sessionStorage キー
// (buildScrollStorageKey() の出力と一致させる)
const SCROLL_STORAGE_KEY = 'scroll_position_/';

// lib/constants/index.ts で定義される値
const SCROLL_RESTORE_RETRY_INTERVAL = 100;
const SCROLL_RESTORE_MAX_ATTEMPTS = 12;
const SCROLL_RESTORE_UI_DELAY = 700;
// retry を全て使い切って restoreScroll が呼ばれるまでの所要時間
const TIME_UNTIL_RESTORE = SCROLL_RESTORE_RETRY_INTERVAL * SCROLL_RESTORE_MAX_ATTEMPTS;

const seedSessionStorage = (overrides: Record<string, unknown> = {}) => {
  sessionStorage.setItem(
    SCROLL_STORAGE_KEY,
    JSON.stringify({
      scrollY: 100,
      timestamp: Date.now(),
      // article-{id} 要素を DOM に置かないため、retry が maxAttempts まで続いてから
      // フォールバックの restoreScroll が走る経路になる
      articleId: 'a1',
      articleIndex: 0,
      ...overrides,
    })
  );
};

describe('useScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe('race condition (regression for #612 / Issue #613)', () => {
    // バグの正確なタイミング:
    // 1. tryOnce が SCROLL_RESTORE_MAX_ATTEMPTS 回 retry → restoreScroll() 実行
    // 2. restoreScroll() が SCROLL_RESTORE_UI_DELAY (700ms) 後に setIsRestoring(false) を予約
    // 3. この 700ms の間に props 変化 → 修正前は effect cleanup で clearTimeout
    //    → setIsRestoring(false) が永久に呼ばれず、オーバーレイが残る
    //
    // 修正後は deps から pagesLoaded/hasNextPage/fetchNextPage を外しているため、
    // cleanup が走らず 700ms 後に isRestoring が false になる。
    it('should set isRestoring back to false when props change AFTER restoreScroll has scheduled the UI delay timer', async () => {
      seedSessionStorage();

      const fetchNextPageA = jest.fn().mockResolvedValue(undefined);
      const fetchNextPageB = jest.fn().mockResolvedValue(undefined);

      const { result, rerender } = renderHook(
        ({ pagesLoaded, hasNextPage, fetchFn }) =>
          useScrollRestoration(
            20,
            pagesLoaded,
            {},
            fetchFn,
            hasNextPage,
            false,
            undefined,
            true
          ),
        {
          initialProps: {
            pagesLoaded: 1,
            hasNextPage: true,
            fetchFn: fetchNextPageA,
          },
        }
      );

      // restoreScroll() が実行され UI delay タイマーが予約されるまで進める
      // (retry 12 * 100ms = 1200ms 経過後に restoreScroll が走り、700ms タイマー予約)
      await act(async () => {
        await jest.advanceTimersByTimeAsync(TIME_UNTIL_RESTORE + 50);
      });

      // 700ms タイマー実行前(まだ isRestoring=true)に props を変化させて
      // cleanup race を誘発する
      expect(result.current.isRestoring).toBe(true);

      await act(async () => {
        rerender({
          pagesLoaded: 2,
          hasNextPage: true,
          fetchFn: fetchNextPageA,
        });
        rerender({
          pagesLoaded: 2,
          hasNextPage: false,
          fetchFn: fetchNextPageB,
        });
      });

      // 残りの UI delay 分(+α)を進める
      // 修正前: clearTimeout で予約タイマー消滅 → isRestoring=true のまま
      // 修正後: cleanup 走らず 700ms タイマー発火 → isRestoring=false
      await act(async () => {
        await jest.advanceTimersByTimeAsync(SCROLL_RESTORE_UI_DELAY + 100);
      });

      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false);
      });
    });
  });

  describe('baseline restoration', () => {
    it('should toggle isRestoring true -> false when restoring with seeded scroll data', async () => {
      seedSessionStorage();

      const fetchNextPage = jest.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useScrollRestoration(
          20,
          1,
          {},
          fetchNextPage,
          false,
          false,
          undefined,
          true
        )
      );

      await waitFor(() => {
        expect(result.current.isRestoring).toBe(true);
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(
          TIME_UNTIL_RESTORE + SCROLL_RESTORE_UI_DELAY + 100
        );
      });

      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false);
      });
    });
  });
});
