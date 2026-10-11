/**
 * LiveStatus: 領域を先に描き、少し後に文言を入れる（WCAG ARIA22。issue #701）
 */
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import '@testing-library/jest-dom';
import { LiveStatus } from '@/components/ui-v2/live-status';

describe('LiveStatus', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('描いた直後の status は空で、少し後に文言が入る', () => {
    render(<LiveStatus message="記事を読み込んでいます..." />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '記事を読み込んでいます...'
    );
  });

  it('サーバー描画では見た目の文言を読めるまま残し、status の文言が入った後は読み上げから外す', () => {
    const html = renderToString(
      <LiveStatus message="記事がありません">
        <p>記事がありません</p>
      </LiveStatus>
    );
    expect(html).not.toContain('aria-hidden');

    render(
      <LiveStatus message="記事がありません">
        <p>記事がありません</p>
      </LiveStatus>
    );
    const visible = screen.getByText('記事がありません').parentElement;
    // status の文言が入るまでは、見た目の文言を読めるまま残す
    expect(visible).not.toHaveAttribute('aria-hidden');
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(visible).toHaveAttribute('aria-hidden', 'true');
  });

  it('文言が変わったら、新しい文言が入るまで見た目の文言を読めるようにする', () => {
    const { rerender } = render(
      <LiveStatus message="1件の記事が見つかりました">
        <p>1件の記事が見つかりました</p>
      </LiveStatus>
    );
    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender(
      <LiveStatus message="2件の記事が見つかりました">
        <p>2件の記事が見つかりました</p>
      </LiveStatus>
    );
    const visible = screen.getByText('2件の記事が見つかりました').parentElement;
    expect(visible).not.toHaveAttribute('aria-hidden');
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '2件の記事が見つかりました'
    );
    expect(visible).toHaveAttribute('aria-hidden', 'true');
  });

  it('アンマウントしたら文言を入れるタイマーを止める', () => {
    const { unmount } = render(<LiveStatus message="読み込み中..." />);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
