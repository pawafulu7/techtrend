import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { readerOptionId } from './article-list-item';
import type { ReaderListArticle } from './types';

interface UseReaderListNavigationOptions {
  articles: ReaderListArticle[];
  /** URL の `article`（開いている記事）。md 未満では、これの有無で一覧と本文を切り替える */
  articleParam: string | null;
  /** 一覧で選んでいる行（use-reader-selection.ts）。null の間は本文の記事に従う */
  activeId: string | null;
  /** 本文に出している記事（`article` が無ければ一覧の先頭） */
  effectiveSelectedId: string | null;
  isDesktopRef: RefObject<boolean>;
  /** 記事を選ぶ（URL と一覧の選択を同時に更新）。replace を省くと、デスクトップは replace・md 未満は push */
  selectArticle: (id: string, opts?: { replace?: boolean }) => void;
  /** md 未満で、一覧の中だけで選ぶ行を動かす */
  moveActive: (id: string) => void;
  /** 次のページを読んで、idx の次の記事を選ぶ（デスクトップの↓で末尾を越えたとき） */
  fetchNextAndSelect: (idx: number) => void;
  loadMore: () => void;
}

/**
 * リーダーの一覧（listbox）のキーボード操作とフォーカスの移動。選んでいる行の state は use-reader-selection.ts。
 *
 * - フォーカスは listbox に置いたまま、選んでいる行を aria-activedescendant で示す（article-list.tsx）
 * - デスクトップ（2ペイン）: 上下の矢印・Home・End で選ぶと本文も替わる（Prev/Next 同様に常に replace）
 * - md 未満（1ペイン）: 矢印は一覧の中で選ぶ行を動かすだけで、Enter（と Space）で開く。
 *   開いたら本文の領域へ、一覧に戻ったら直前の行（listbox。一覧がまだ描かれていなければ一覧の領域）へフォーカスを移す
 */
export function useReaderListNavigation({
  articles,
  articleParam,
  activeId,
  effectiveSelectedId,
  isDesktopRef,
  selectArticle,
  moveActive,
  fetchNextAndSelect,
  loadMore,
}: UseReaderListNavigationOptions) {
  const listActiveId = activeId ?? effectiveSelectedId;

  // リストからの選択: モバイルはpush（ブラウザバックでリストへ戻れる）、
  // デスクトップはreplace（履歴を汚さない）
  const handleSelectArticle = useCallback(
    (articleId: string) => selectArticle(articleId),
    [selectArticle]
  );

  // 一覧の中で選ぶ行を動かす。デスクトップは本文も替える
  const moveListActive = useCallback(
    (articleId: string) => {
      if (isDesktopRef.current) {
        selectArticle(articleId, { replace: true });
      } else {
        moveActive(articleId);
      }
    },
    [isDesktopRef, selectArticle, moveActive]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (articles.length === 0) return;
      // 修飾キー付きはブラウザや支援技術の操作なので横取りしない
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const idx = listActiveId
        ? articles.findIndex((a) => a.id === listActiveId)
        : -1;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (idx < articles.length - 1) {
            moveListActive(articles[idx + 1].id);
          } else if (isDesktopRef.current) {
            fetchNextAndSelect(idx);
          } else {
            loadMore();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (idx > 0) moveListActive(articles[idx - 1].id);
          break;
        case 'Home':
          e.preventDefault();
          moveListActive(articles[0].id);
          break;
        case 'End':
          e.preventDefault();
          moveListActive(articles[articles.length - 1].id);
          break;
        case 'Enter':
        case ' ':
          // デスクトップは選んだ時点で本文に出ているので何もしない（Space の一覧のスクロールも止めない）
          if (isDesktopRef.current) break;
          e.preventDefault();
          if (idx >= 0) handleSelectArticle(articles[idx].id);
          break;
      }
    },
    [
      articles,
      listActiveId,
      isDesktopRef,
      moveListActive,
      fetchNextAndSelect,
      loadMore,
      handleSelectArticle,
    ]
  );

  // md 未満で記事を開いたら本文の領域へ、一覧に戻ったら直前の行（listbox）へフォーカスを移す。
  // 本文の見出しは読み込み中・失敗のときに描かれず、前の記事の見出しが残ることもあるので、行き先は常に描かれる領域にする。
  // デスクトップは2ペインのままなので、フォーカスは操作した場所に残す
  const listboxRef = useRef<HTMLDivElement>(null);
  const listRegionRef = useRef<HTMLDivElement>(null);
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const previousArticleParamRef = useRef(articleParam);
  const listActiveIdRef = useRef(listActiveId);
  useEffect(() => {
    listActiveIdRef.current = listActiveId;
  }, [listActiveId]);
  useEffect(() => {
    const previous = previousArticleParamRef.current;
    previousArticleParamRef.current = articleParam;
    if (isDesktopRef.current) return;
    if (!previous && articleParam) {
      detailRegionRef.current?.focus();
    } else if (previous && !articleParam) {
      // 一覧がまだ読み込み中・失敗で listbox が無いときは、常に描かれる一覧の領域へ
      (listboxRef.current ?? listRegionRef.current)?.focus({
        preventScroll: true,
      });
      // 隠れていた一覧はスクロールの位置を失っているので、直前の行を見える位置へ戻す
      const activeId = listActiveIdRef.current;
      if (activeId) {
        document
          .getElementById(readerOptionId(activeId))
          ?.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [articleParam, isDesktopRef]);

  return {
    listActiveId,
    handleSelectArticle,
    handleKeyDown,
    listboxRef,
    listRegionRef,
    detailRegionRef,
  };
}
