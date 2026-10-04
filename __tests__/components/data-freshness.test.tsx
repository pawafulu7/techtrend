import { render, screen } from '@testing-library/react';
import { DataFreshness } from '@/app/components/common/data-freshness';

// 2026-10-04 13:58 UTC = 22:58 JST
const AT = '2026-10-04T13:58:00.000Z';

describe('DataFreshness（issue #707）', () => {
  it('集計期間と集計時刻を日本時間で出す', () => {
    render(<DataFreshness at={AT} period="直近7日" />);
    const el = screen.getByTestId('data-freshness');
    expect(el).toHaveTextContent('直近7日の記事を 10月4日 22:58 に集計');
    expect(el.querySelector('time')).toHaveAttribute('dateTime', AT);
  });

  it('期間が無ければ集計時刻だけを出す', () => {
    render(<DataFreshness at={new Date(AT)} />);
    expect(screen.getByTestId('data-freshness')).toHaveTextContent(
      '10月4日 22:58 に集計'
    );
  });

  it('画面の取得時刻は「に取得」と出し、集計と区別する', () => {
    render(<DataFreshness at={Date.parse(AT)} kind="fetched" />);
    expect(screen.getByTestId('data-freshness')).toHaveTextContent(
      '10月4日 22:58 に取得'
    );
  });

  it.each([null, undefined, 'not-a-date'])(
    '時刻が無い・不正（%p）なら何も出さない',
    (at) => {
      const { container } = render(<DataFreshness at={at} period="全期間" />);
      expect(container).toBeEmptyDOMElement();
    }
  );
});
