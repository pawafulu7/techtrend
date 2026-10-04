import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

interface RefreshAnchor {
  articleId: string;
  top: number;
  fetchedAt: number | undefined;
}

function findArticle(container: HTMLElement, articleId: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-article-id]')
  ).find((item) => item.dataset.articleId === articleId);
}

/**
 * 一覧の手動更新（issue #707）。refetch で読み込み済みの全ページを取り直し、
 * 読んでいた記事が画面上の同じ位置に来るようにスクロールを合わせる。
 *
 * 基準は、更新前に表示領域の上端にかかっていた最初の記事（`data-article-id`）。
 * 新しい一覧（fetchedAt が変わった描画）の直後、描画前に位置を戻す。
 */
export function useRefreshKeepingPosition({
  containerRef,
  refetch,
  fetchedAt,
}: {
  containerRef: RefObject<HTMLElement | null>;
  refetch: () => Promise<unknown>;
  /** 一覧の先頭ページを取得した時刻。変わったら新しい一覧が届いたとみなす */
  fetchedAt: number | undefined;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const anchorRef = useRef<RefreshAnchor | null>(null);

  const releaseAnchor = useCallback(() => {
    anchorRef.current = null;
    const container = containerRef.current;
    if (container) container.style.overflowAnchor = '';
  }, [containerRef]);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    const container = containerRef.current;
    if (container) {
      const containerTop = container.getBoundingClientRect().top;
      const items =
        container.querySelectorAll<HTMLElement>('[data-article-id]');
      for (const el of items) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > containerTop && el.dataset.articleId) {
          anchorRef.current = {
            articleId: el.dataset.articleId,
            top: rect.top,
            fetchedAt,
          };
          // ブラウザのスクロールアンカリングと二重に補正しない
          container.style.overflowAnchor = 'none';
          break;
        }
      }
    }
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
      // 失敗などで新しい一覧が届かなかったとき、基準を残さない
      if (anchorRef.current) releaseAnchor();
    }
  }, [isRefreshing, containerRef, refetch, fetchedAt, releaseAnchor]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || fetchedAt === anchor.fetchedAt) return;
    const container = containerRef.current;
    const el = container && findArticle(container, anchor.articleId);
    if (container && el) {
      container.scrollTop += el.getBoundingClientRect().top - anchor.top;
    }
    releaseAnchor();
  }, [fetchedAt, containerRef, releaseAnchor]);

  return { isRefreshing, refresh };
}
