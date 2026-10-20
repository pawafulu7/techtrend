/**
 * リーダーの一覧で選んでいる行（app/reader/use-reader-selection.ts）。
 *
 * - 自分で選んだ（URL を書いた）後に、途中の古い URL の値が遅れて届いても、選択を巻き戻さない
 * - 途中の値が飛ばされても、その後の選択（本文の「次の記事」など）で一覧が本文の記事を指す
 * - Next の router 遷移（リンク・並び順）で `article` が変わったら取り込む。Next は URL を commit のとき
 *   （HistoryUpdater の useInsertionEffect）に書くので、テストの Harness も同じ順で書く
 * - md 未満で一覧に戻ったら直前の行を指したまま。デスクトップに広げたら本文の記事に戻す
 */
import { useInsertionEffect, useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useReaderSelection } from '@/app/reader/use-reader-selection';

type Selection = ReturnType<typeof useReaderSelection>;

function setUrl(search: string) {
  window.history.replaceState(null, '', `/reader${search}`);
}

function currentArticle(): string | null {
  return new URLSearchParams(window.location.search).get('article');
}

interface HarnessProps {
  /** useSearchParams の `article` */
  articleParam: string | null;
  isDesktop: boolean;
  /** Next の router 遷移が commit のときに書く URL の search（省くと書かない） */
  routerSearch?: string;
  selection: { current: Selection | null };
}

function Harness({
  articleParam,
  isDesktop,
  routerSearch,
  selection,
}: HarnessProps) {
  useInsertionEffect(() => {
    if (routerSearch !== undefined) setUrl(routerSearch);
  }, [routerSearch]);
  const isDesktopRef = useRef(isDesktop);
  isDesktopRef.current = isDesktop;
  const result = useReaderSelection({ articleParam, isDesktop, isDesktopRef });
  selection.current = result;
  return <output data-testid="active">{result.activeId ?? 'null'}</output>;
}

function setup(initial: Omit<HarnessProps, 'selection'>) {
  const selection: { current: Selection | null } = { current: null };
  const view = render(<Harness {...initial} selection={selection} />);
  const rerender = (props: Omit<HarnessProps, 'selection'>) =>
    view.rerender(<Harness {...props} selection={selection} />);
  const select = (id: string) =>
    act(() => selection.current?.selectArticle(id, { replace: true }));
  return { selection, rerender, select };
}

function active() {
  return screen.getByTestId('active').textContent;
}

beforeEach(() => {
  setUrl('');
});

describe('useReaderSelection', () => {
  it('自分で選んだ後に、途中の古い URL の値が遅れて届いても選択を巻き戻さない', () => {
    setUrl('?article=A');
    const { rerender, select } = setup({ articleParam: 'A', isDesktop: true });

    select('B');
    select('C');
    expect(currentArticle()).toBe('C');
    expect(active()).toBe('C');

    rerender({ articleParam: 'B', isDesktop: true });
    expect(active()).toBe('C');
    rerender({ articleParam: 'C', isDesktop: true });
    expect(active()).toBe('C');
  });

  it('途中の値が飛ばされて元の値に戻った後も、次の選択で一覧は本文の記事を指す', () => {
    setUrl('?article=A');
    const { rerender, select } = setup({ articleParam: 'A', isDesktop: true });

    // ↓・↑（B の URL は useSearchParams に届かず、articleParam は A のまま）
    select('B');
    select('A');
    expect(active()).toBe('A');
    // 本文の「次の記事」
    select('B');
    rerender({ articleParam: 'B', isDesktop: true });
    expect(currentArticle()).toBe('B');
    expect(active()).toBe('B');
  });

  it('Next の router 遷移で article が消えたら（デスクトップ）、選択を本文の記事に戻す', () => {
    setUrl('?article=B');
    const { rerender } = setup({ articleParam: 'B', isDesktop: true });
    expect(active()).toBe('B');

    // ヘッダーの「リーダー」: レンダー中の URL はまだ ?article=B で、commit のときに書き換わる
    rerender({ articleParam: null, isDesktop: true, routerSearch: '' });
    expect(currentArticle()).toBeNull();
    expect(active()).toBe('null');
  });

  it('ブラウザの戻る・進む（外からの値）は取り込む', () => {
    setUrl('?article=A');
    const { rerender } = setup({ articleParam: 'A', isDesktop: true });

    setUrl('?article=D');
    rerender({ articleParam: 'D', isDesktop: true });
    expect(active()).toBe('D');
  });

  it('md 未満で一覧に戻ったら、直前に開いていた行を指したまま', () => {
    setUrl('?article=B');
    const { rerender } = setup({ articleParam: 'B', isDesktop: false });

    rerender({ articleParam: null, isDesktop: false, routerSearch: '' });
    expect(active()).toBe('B');
  });

  it('md 未満で動かした行は、デスクトップに広げると本文の記事に戻す', () => {
    const { selection, rerender } = setup({
      articleParam: null,
      isDesktop: false,
    });
    act(() => selection.current?.moveActive('C'));
    expect(active()).toBe('C');
    // URL は書かない（開くのは Enter）
    expect(currentArticle()).toBeNull();

    rerender({ articleParam: null, isDesktop: true });
    expect(active()).toBe('null');
  });

  it('選択の操作ごとに世代を進める（次ページの自動選択を取り消す判定に使う）', () => {
    const { selection, select } = setup({
      articleParam: null,
      isDesktop: true,
    });
    const before = selection.current?.generationRef.current ?? 0;
    select('A');
    act(() => selection.current?.moveActive('B'));
    expect(selection.current?.generationRef.current).toBe(before + 2);
  });
});
