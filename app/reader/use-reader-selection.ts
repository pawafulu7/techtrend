import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

interface UseReaderSelectionOptions {
  /** URL の `article`（useSearchParams）。開いている記事 */
  articleParam: string | null;
  isDesktop: boolean;
  isDesktopRef: RefObject<boolean>;
}

/**
 * 記事を URL の `article` パラメータへ native History API で書く。replace を省くと、デスクトップは replace
 * （履歴を汚さない）、md 未満は push（ブラウザバックで一覧へ戻れる）。
 * router.push/replace を使わないのは、/reader が force-dynamic のため
 * Next Router 経由の遷移は毎回サーバー(sources/tags/session取得)への
 * RSCリクエストを発生させてしまうから。
 */
function writeArticleParam(id: string, replace: boolean): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('article', id);
  const url = `${window.location.pathname}?${params.toString()}`;
  // data引数には null を渡す（history.state をそのまま渡すと Next.js の
  // 内部フラグ __NA が付いた状態になり、パッチされた pushState/replaceState が
  // 「Next.js内部からの呼び出し」と誤認して useSearchParams への同期処理を
  // スキップしてしまうため。null なら Next.js が現在の内部treeを自動でコピーする）
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}

/**
 * リーダーの一覧で選んでいる行（activeId）。null の間は本文の記事（`article` が無ければ一覧の先頭）に従う。
 *
 * - 記事を選ぶ経路（一覧のクリック・矢印・本文の前の記事・次の記事・次ページの自動選択）は、すべて
 *   selectArticle を通す。URL を書くのと同時に activeId を更新する。URL の更新（useSearchParams）は
 *   transition の中で遅れて届き、途中の値が飛ばされることもあるので、URL から作ると連打で古い位置から動くため
 * - 外からの URL の変化（Next のリンク・並び順などの router 遷移、ブラウザの戻る・進む）は、commit の後に
 *   今の URL と照合して取り込む。Next の router 遷移は URL を commit のとき（useInsertionEffect）に書くので、
 *   レンダー中に照合すると古い URL を見てしまう。照合して違う値は、後から自分で書いた URL に追い越された途中の値
 * - md 未満で一覧に戻ったとき（`article` が null）は、直前に開いていた行を指したままにする
 * - md 未満からデスクトップに広げたときは、一覧の選択を本文の記事に戻す（2 ペインで食い違わないように）
 */
export function useReaderSelection({
  articleParam,
  isDesktop,
  isDesktopRef,
}: UseReaderSelectionOptions) {
  const [activeId, setActiveId] = useState<string | null>(articleParam);
  // 選択の操作の回数。次ページを読んでから選ぶ処理が、読む間に別の記事が選ばれていたら取り消すのに使う
  const generationRef = useRef(0);

  const selectArticle = useCallback(
    (id: string, opts?: { replace?: boolean }) => {
      generationRef.current += 1;
      setActiveId(id);
      writeArticleParam(id, opts?.replace ?? isDesktopRef.current);
    },
    [isDesktopRef]
  );

  // md 未満で、一覧の中だけで選ぶ行を動かす（URL は書かない。開くのは Enter）
  const moveActive = useCallback((id: string) => {
    generationRef.current += 1;
    setActiveId(id);
  }, []);

  useEffect(() => {
    const latestArticle = new URLSearchParams(window.location.search).get(
      'article'
    );
    if (latestArticle !== articleParam) return;
    // 外部（URL）の変化を state に取り込む。レンダー中には今の URL を確かめられないので effect で行う
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (articleParam) setActiveId(articleParam);
    else if (isDesktopRef.current) setActiveId(null);
  }, [articleParam, isDesktopRef]);

  const [syncedIsDesktop, setSyncedIsDesktop] = useState(isDesktop);
  if (isDesktop !== syncedIsDesktop) {
    setSyncedIsDesktop(isDesktop);
    if (isDesktop) setActiveId(articleParam);
  }

  return { activeId, selectArticle, moveActive, generationRef };
}
