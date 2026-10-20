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
 * URL から `article` を外し、md 未満で一覧に戻す（「← 記事リスト」）。
 * history.back() だとdeep link直遷移時に戻り先が存在せずアプリ外に出て
 * しまうことがあるため、常にpushStateでarticleを外す方式にしている。
 */
function removeArticleParam(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('article');
  const qs = params.toString();
  const url = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.pushState(null, '', url);
}

function currentArticleParam(): string | null {
  return new URLSearchParams(window.location.search).get('article');
}

/**
 * リーダーの一覧で選んでいる行（activeId）と、記事を選ぶ・一覧に戻る処理。null の間は本文の記事
 * （`article` が無ければ一覧の先頭）に従う。
 *
 * - 記事を選ぶ経路（一覧のクリック・矢印・本文の前の記事・次の記事・次ページの自動選択）は、すべて
 *   selectArticle を通す。URL を書くのと同時に activeId を更新する。URL の更新（useSearchParams）は
 *   transition の中で遅れて届き、途中の値が飛ばされることもあるので、URL から作ると連打で古い位置から動くため
 * - 外からの URL の変化（Next のリンク・並び順などの router 遷移、ブラウザの戻る・進む）は、commit のたびに
 *   今の URL と照合して取り込む。Next の router 遷移は URL を commit のとき（useInsertionEffect）に書くので、
 *   レンダー中に照合すると古い URL を見てしまう。今の URL と articleParam が違う間は、自分で書いた URL が
 *   まだ届いていないので何もしない。articleParam の値が前と同じでも（選んだ記事が届く前に同じ値へ戻る遷移）
 *   照合するよう、値の変化ではなく commit ごとに見る
 * - md 未満で一覧に戻ったとき（`article` が null）は、直前に開いていた行を指したままにする。
 *   デスクトップでは本文の記事に合わせる（md 未満から広げたときも）
 * - 次ページを読んでから選ぶ処理（beginPendingSelection）は、読む間に選択が変わったら取り消す。
 *   自分で選んだ・一覧の中で動かした・一覧に戻った・外から URL が変わった・この画面を離れた（アンマウント）のどれでも
 */
export function useReaderSelection({
  articleParam,
  isDesktop,
  isDesktopRef,
}: UseReaderSelectionOptions) {
  const [activeId, setActiveId] = useState<string | null>(articleParam);
  // 選択の操作の世代。保留中の自動選択は、始めたときの世代と違えば取り消す
  const generationRef = useRef(0);
  const invalidatePending = useCallback(() => {
    generationRef.current += 1;
  }, []);

  const selectArticle = useCallback(
    (id: string, opts?: { replace?: boolean }) => {
      invalidatePending();
      setActiveId(id);
      writeArticleParam(id, opts?.replace ?? isDesktopRef.current);
    },
    [invalidatePending, isDesktopRef]
  );

  // md 未満で、一覧の中だけで選ぶ行を動かす（URL は書かない。開くのは Enter）
  const moveActive = useCallback(
    (id: string) => {
      invalidatePending();
      setActiveId(id);
    },
    [invalidatePending]
  );

  // md 未満の「← 記事リスト」。一覧は直前に開いていた行を指したまま
  const backToList = useCallback(() => {
    invalidatePending();
    removeArticleParam();
  }, [invalidatePending]);

  /**
   * 次ページを読んでから選ぶ処理を始める。返す関数は、読み終えた時点でまだ選んでよいか（その間に選択が
   * 変わっていないか）を返す
   */
  const beginPendingSelection = useCallback(() => {
    const generation = generationRef.current;
    return () => generationRef.current === generation;
  }, []);

  // 外からの URL の変化を取り込む。commit ごとに照合する（依存配列を付けない）。articleParam も activeId も
  // 変わらない遷移（選んだ記事が届く前に同じ値へ戻る router 遷移）でも、URL が落ち着いた時点で合わせるため。
  // 合わせた後は target === activeId で何もしないので、更新が続くことはない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentArticleParam() !== articleParam) return;
    const target = articleParam ?? (isDesktop ? null : activeId);
    if (target === activeId) return;
    invalidatePending();
    // 外部（URL）の変化を state に取り込む。レンダー中には今の URL を確かめられないので effect で行う
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveId(target);
  });

  // ブラウザの戻る・進むなどで本文の記事が閉じた（md 未満で一覧に戻った）ときも、保留中の自動選択を取り消す
  const previousArticleParamRef = useRef(articleParam);
  useEffect(() => {
    if (previousArticleParamRef.current !== null && articleParam === null) {
      invalidatePending();
    }
    previousArticleParamRef.current = articleParam;
  }, [articleParam, invalidatePending]);

  // この画面を離れたら（フィルタの変更で作り直されたときも）、保留中の自動選択が新しい URL を書き換えないようにする
  useEffect(() => invalidatePending, [invalidatePending]);

  return {
    activeId,
    selectArticle,
    moveActive,
    backToList,
    beginPendingSelection,
  };
}
