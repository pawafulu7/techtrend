import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

/** refetch の結果のうち、新しい一覧が届いたかの判定に使う部分 */
interface RefetchResult {
  isError: boolean;
  data?: { pages: Array<{ fetchedAt?: number }> };
}

interface RefreshAnchor {
  listKey: string;
  articleId: string;
  top: number;
  fetchedAt: number | undefined;
}

// 新しい一覧が DOM に出るのを待つ上限。超えたら位置を合わせずに諦める
const RESTORE_TIMEOUT_MS = 3000;

function articleElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-article-id]')
  );
}

/** DOM の記事の並びが、新しい一覧を描画し終えた状態か */
function rendersList(elements: HTMLElement[], articleIds: string[]) {
  return (
    elements.length === articleIds.length &&
    elements.every((el, i) => el.dataset.articleId === articleIds[i])
  );
}

/** 表示領域の上端にかかっている最初の記事とその位置 */
function findTopArticle(container: HTMLElement) {
  const containerTop = container.getBoundingClientRect().top;
  for (const el of articleElements(container)) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > containerTop && el.dataset.articleId) {
      return { articleId: el.dataset.articleId, top: rect.top };
    }
  }
  return null;
}

/**
 * 一覧の手動更新（issue #707）。refetch で読み込み済みの全ページを取り直し、
 * 読んでいた記事が画面上の同じ位置に来るようにスクロールを合わせる。
 *
 * 基準は、更新前に表示領域の上端にかかっていた最初の記事（`data-article-id`）。
 * 更新中に利用者がスクロールしたら、その位置で基準を取り直す。
 *
 * 新しい一覧が DOM に出るタイミングは2段階で遅れる。TanStack Query は refetch の
 * Promise を解決した後に（setTimeout 0 のバッチで）データを届け、ArticleList は
 * 受け取った記事を useEffect で内部 state に移してから描画する。そのため、DOM の記事の
 * 並びが新しい一覧と一致した時点（MutationObserver の通知は描画前に来る）で位置を戻す。
 */
export function useRefreshKeepingPosition({
  containerRef,
  refetch,
  fetchedAt,
  articleIds,
  listKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  refetch: () => Promise<RefetchResult>;
  /** 一覧の先頭ページを取得した時刻。変わったら新しい一覧が届いたとみなす */
  fetchedAt: number | undefined;
  /** 描画される記事の ID（一覧の順） */
  articleIds: string[];
  /** 一覧の識別子（絞り込み条件）。更新中に別の一覧へ切り替わったら位置を合わせない */
  listKey: string;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const anchorRef = useRef<RefreshAnchor | null>(null);
  // 基準を捨てるときに止める監視（スクロール・DOM の変化・時間切れ）
  const cleanupsRef = useRef<Array<() => void>>([]);
  // DOM の監視（MutationObserver）の中から最新の一覧を読むため
  const articleIdsRef = useRef(articleIds);
  useLayoutEffect(() => {
    articleIdsRef.current = articleIds;
  }, [articleIds]);

  const releaseAnchor = useCallback(() => {
    cleanupsRef.current.forEach((cleanup) => cleanup());
    cleanupsRef.current = [];
    anchorRef.current = null;
    const container = containerRef.current;
    if (container) container.style.overflowAnchor = '';
  }, [containerRef]);

  useEffect(() => releaseAnchor, [releaseAnchor]);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    releaseAnchor();
    const container = containerRef.current;
    const top = container && findTopArticle(container);
    const anchor: RefreshAnchor | null = top
      ? { listKey, fetchedAt, ...top }
      : null;
    if (container && anchor) {
      anchorRef.current = anchor;
      // ブラウザのスクロールアンカリングと二重に補正しない
      container.style.overflowAnchor = 'none';
      // 更新中に利用者が読み進めたら、その位置を保つ（補正で巻き戻さない）
      const onScroll = () => {
        const next = findTopArticle(container);
        if (next) Object.assign(anchor, next);
      };
      container.addEventListener('scroll', onScroll, { passive: true });
      cleanupsRef.current.push(() =>
        container.removeEventListener('scroll', onScroll)
      );
    }
    setIsRefreshing(true);
    try {
      const result = await refetch();
      // 失敗や取り消しで新しい一覧が届かないときは、基準を残さない。
      // 届くときは、新しい一覧の描画で位置を戻してから基準を捨てる
      const nextFetchedAt = result.data?.pages[0]?.fetchedAt;
      if (
        anchor &&
        anchorRef.current === anchor &&
        (result.isError || nextFetchedAt === anchor.fetchedAt)
      ) {
        releaseAnchor();
      }
    } catch (error) {
      if (anchor && anchorRef.current === anchor) releaseAnchor();
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, containerRef, refetch, fetchedAt, listKey, releaseAnchor]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = containerRef.current;
    if (!anchor || !container) return;
    if (listKey !== anchor.listKey) {
      releaseAnchor();
      return;
    }
    if (fetchedAt === anchor.fetchedAt) return;

    const tryRestore = () => {
      const elements = articleElements(container);
      if (!rendersList(elements, articleIdsRef.current)) return false;
      const el = elements.find(
        (item) => item.dataset.articleId === anchor.articleId
      );
      if (el) {
        container.scrollTop += el.getBoundingClientRect().top - anchor.top;
      }
      releaseAnchor();
      return true;
    };

    if (tryRestore()) return;
    const observer = new MutationObserver(() => {
      tryRestore();
    });
    observer.observe(container, { childList: true, subtree: true });
    const timeoutId = setTimeout(releaseAnchor, RESTORE_TIMEOUT_MS);
    cleanupsRef.current.push(() => {
      observer.disconnect();
      clearTimeout(timeoutId);
    });
    // 監視は effect の再実行では止めない。止めるのは位置を戻したとき・時間切れ・
    // 次の更新の開始・アンマウント（いずれも releaseAnchor）
  }, [fetchedAt, listKey, containerRef, releaseAnchor]);

  return { isRefreshing, refresh };
}
