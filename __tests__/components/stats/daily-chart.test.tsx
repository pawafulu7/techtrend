/**
 * 日別のグラフ（app/components/stats/daily-chart.tsx）の日付の表示（issue #807）。
 *
 * daily[].date は日本時間の暦日（YYYY-MM-DD）。new Date('YYYY-MM-DD') は UTC の 0 時として読むので、
 * ローカル時刻の getDate() や timeZone を付けない toLocaleDateString() は、UTC より遅れたタイムゾーンの
 * 閲覧者には前日を出す。ここでは閲覧者が America/Los_Angeles にいる状態を作って確かめる。
 * Jest の中では process.env.TZ を変えても効かない（テストの process.env は実際の環境変数のコピー）ので、
 * ローカル時刻で読むメソッドが LA の時刻を返すようにする（timeZone を指定した呼び出しは指定どおり）。
 */
import { render, screen } from '@testing-library/react';
import { DailyChart } from '@/app/components/stats/daily-chart';

const VIEWER_TIME_ZONE = 'America/Los_Angeles';
const realToLocaleDateString = Date.prototype.toLocaleDateString;

beforeEach(() => {
  jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (
    this: Date
  ) {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: VIEWER_TIME_ZONE,
        day: 'numeric',
      }).format(this)
    );
  });
  jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    return realToLocaleDateString.call(this, locales, {
      timeZone: VIEWER_TIME_ZONE,
      ...options,
    });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DailyChart の日付（閲覧者が UTC より遅れたタイムゾーン）', () => {
  it('前提: ローカル時刻で読むと、UTC の 0 時は前日になる', () => {
    const date = new Date('2026-10-01');
    expect(date.getDate()).toBe(30);
    expect(
      date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
    ).toBe('9月30日');
  });

  it('棒の下の日と、期間の両端の日付を、日本時間の暦日のまま出す', () => {
    render(
      <DailyChart
        data={[
          { date: '2026-10-01', total: 3, sources: { S1: 3 } },
          { date: '2026-10-02', total: 0, sources: {} },
          { date: '2026-10-03', total: 1, sources: { S1: 1 } },
        ]}
      />
    );

    for (const day of ['1', '2', '3']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.queryByText('30')).not.toBeInTheDocument();
    expect(screen.getByText('10月1日')).toBeInTheDocument();
    expect(screen.getByText('10月3日')).toBeInTheDocument();
    expect(screen.queryByText('9月30日')).not.toBeInTheDocument();
  });
});
