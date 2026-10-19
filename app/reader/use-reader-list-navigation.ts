import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { readerOptionId } from './article-list-item';
import type { ReaderListArticle } from './types';

interface UseReaderListNavigationOptions {
  articles: ReaderListArticle[];
  /** URL の `article`（開いている記事）。md 未満では、これの有無で一覧と本文を切り替える */
  articleParam: string | null;
  /** 本文に出している記事（`article` が無ければ一覧の先頭） */
  effectiveSelectedId: string | null;
  isDesktop: boolean;
  isDesktopRef: RefObject<boolean>;
  /** 記事を選ぶ（URL の `article` を替える）。replace を省くと、デスクトップは replace・md 未満は push */
  selectArticle: (id: string, opts?: { replace?: boolean }) => void;
  /** 次のページを読んで、idx の次の記事を選ぶ（デスクトップの↓で末尾を越えたとき） */
  fetchNextAndSelect: (idx: number) => void;
  loadMore: () => void;
}

/**
 * リーダーの一覧（listbox）の選択・キーボード操作・フォーカスの移動。
 *
 * - フォーカスは listbox に置いたまま、選んでいる行を aria-activedescendant で示す（article-list.tsx）
 * - デスクトップ（2ペイン）: 上下の矢印・Home・End で選ぶと本文も替わる（Prev/Next 同様に常に replace）
 * - md 未満（1ペイン）: 矢印は一覧の中で選ぶ行を動かすだけで、Enter（と Space）で開く。
 *   開いたら本文の領域へ、一覧に戻ったら直前の行（listbox。一覧がまだ描かれていなければ一覧の領域）へフォーカスを移す
 *
 * 選んでいる行は、URL（articleParam）から作らずにここの state で持つ。URL の更新（useSearchParams）は
 * transition の中で遅れて届くので、矢印キーを連打すると古い位置から動いてしまうため。
 * articleParam が変わったときは、今の URL と一致するときだけ選択を合わせる。History API は同期で URL を
 * 書き換えるので、一致しない値は途中の古い値で、それで選択を巻き戻さない（途中の値が届かずに飛ばされることも
 * あるので、自分で書いた値を覚えて照合する形にはしない）
 */
export function useReaderListNavigation({
  articles,
  articleParam,
  effectiveSelectedId,
  isDesktop,
  isDesktopRef,
  selectArticle,
  fetchNextAndSelect,
  loadMore,
}: UseReaderListNavigationOptions) {
  // 一覧で選んでいる行。null の間は本文の記事（effectiveSelectedId）に従う。md 未満では、記事を開いている間
  // （前の記事・次の記事を含む）は開いている記事に合わせ、一覧に戻ったときにその行を指す
  const [activeId, setActiveId] = useState<string | null>(articleParam);
  const [syncedArticleParam, setSyncedArticleParam] = useState(articleParam);
  if (articleParam !== syncedArticleParam) {
    setSyncedArticleParam(articleParam);
    const latestArticle =
      typeof window === 'undefined'
        ? articleParam
        : new URLSearchParams(window.location.search).get('article');
    // 今の URL の値（自分で選んだ記事、本文の前の記事・次の記事、ブラウザの戻る・進む）。md 未満で一覧に
    // 戻ったとき（null）は、直前に開いていた行を指したままにする
    if (articleParam === latestArticle) {
      if (articleParam) setActiveId(articleParam);
      else if (isDesktop) setActiveId(null);
    }
  }
  const listActiveId = activeId ?? effectiveSelectedId;

  const writeSelection = useCallback(
    (articleId: string, opts?: { replace?: boolean }) => {
      setActiveId(articleId);
      selectArticle(articleId, opts);
    },
    [selectArticle]
  );

  // リストからの選択: モバイルはpush（ブラウザバックでリストへ戻れる）、
  // デスクトップはreplace（履歴を汚さない）
  const handleSelectArticle = useCallback(
    (articleId: string) => writeSelection(articleId),
    [writeSelection]
  );

  // 一覧の中で選ぶ行を動かす。デスクトップは本文も替える
  const moveListActive = useCallback(
    (articleId: string) => {
      if (isDesktopRef.current) {
        writeSelection(articleId, { replace: true });
      } else {
        setActiveId(articleId);
      }
    },
    [isDesktopRef, writeSelection]
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
