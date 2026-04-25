import { act, renderHook, waitFor } from '@testing-library/react';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { TIMEOUTS } from '@/lib/constants/index';
import { buildScrollStorageKey } from '@/lib/utils/scroll';

// jsdom の location から実際のキーを導出 (production 実装と必ず一致)
const SCROLL_STORAGE_KEY = buildScrollStorageKey();

const {
  SCROLL_RESTORE_RETRY_INTERVAL,
  SCROLL_RESTORE_MAX_ATTEMPTS,
  SCROLL_RESTORE_UI_DELAY,
} = TIMEOUTS;

// tryRestoreWithRetry は初回 setRestorationTimeout(tryOnce, interval) を実行した後、
// tryOnce 内の `attempts < maxAttempts` 判定により最大 MAX_ATTEMPTS 回再スケジュールしてから
// restoreScroll() を呼ぶ。
// → 合計 (MAX_ATTEMPTS + 1) * RETRY_INTERVAL ms でフォールバック restoreScroll が実行される
const TIME_UNTIL_RESTORE =
  SCROLL_RESTORE_RETRY_INTERVAL * (SCROLL_RESTORE_MAX_ATTEMPTS + 1);

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

  afterEach(async () => {
    // pending タイマーを流したあとマイクロタスクをドレインしてからリアルタイマーへ戻す
    // (fetchRequiredPagesAndRestore / restoreScroll 由来の Promise リーク防止)
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    jest.useRealTimers();
    sessionStorage.clear();
  });

  describe('race condition (regression for #612 / Issue #613)', () => {
    // バグの正確なタイミング:
    // 1. tryOnce が SCROLL_RESTORE_MAX_ATTEMPTS 回 retry → restoreScroll() 実行
    // 2. restoreScroll() が SCROLL_RESTORE_UI_DELAY (700ms) 後に setIsRestoring(false) を予約
    // 3. この 700ms の間に deps 該当 prop が変化 → 修正前は effect cleanup で clearTimeout
    //    → setIsRestoring(false) が永久に呼ばれず、オーバーレイが残る
    //
    // 修正後は deps から pagesLoaded/hasNextPage/fetchNextPage を外しているため、
    // cleanup が走らず 700ms 後に isRestoring が false になる。
    it('should set isRestoring back to false when pagesLoaded changes AFTER restoreScroll has scheduled the UI delay timer', async () => {
      seedSessionStorage();

      const fetchNextPage = jest.fn().mockResolvedValue(undefined);

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
            fetchFn: fetchNextPage,
          },
        }
      );

      // 初回 setRestorationTimeout + retry MAX_ATTEMPTS 回 = (MAX_ATTEMPTS + 1) * INTERVAL ms 経過直後
      // この時点で restoreScroll() が走り終わり、UI delay タイマー(700ms)が予約済み・未発火
      await act(async () => {
        await jest.advanceTimersByTimeAsync(TIME_UNTIL_RESTORE + 10);
      });

      // UI delay タイマー実行前(まだ isRestoring=true)であることを確認
      expect(result.current.isRestoring).toBe(true);

      // 修正前 deps に含まれていた prop を 1 つだけ変えれば回帰時の cleanup を誘発できる
      // (回帰検出としては最小ケース。意図が伝わりやすく、どの prop の変化で再現するかも明確)
      await act(async () => {
        rerender({
          pagesLoaded: 2,
          hasNextPage: true,
          fetchFn: fetchNextPage,
        });
      });

      // UI delay 分(+α)を進める
      // 修正前: clearTimeout で予約タイマー消滅 → isRestoring=true のまま
      // 修正後: cleanup 走らず 700ms タイマー発火 → isRestoring=false
      await act(async () => {
        await jest.advanceTimersByTimeAsync(SCROLL_RESTORE_UI_DELAY + 50);
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
          TIME_UNTIL_RESTORE + SCROLL_RESTORE_UI_DELAY + 50
        );
      });

      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false);
      });
    });
  });
});
