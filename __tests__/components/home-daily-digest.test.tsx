import { render, screen, within } from '@testing-library/react';
import { HomeDailyDigest } from '@/app/components/home/home-daily-digest';
import type { HomeDailyDigest as HomeDailyDigestData } from '@/lib/services/trend-report/home-daily-digest';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const SUMMARY = {
  core: 'AIエージェントの実行基盤が技術的焦点となっている。',
  keyTopics: [
    { topic: 'エージェント基盤', whyItMatters: '運用の負担が減る' },
    { topic: 'Kubernetes', whyItMatters: '管理が標準化される' },
    { topic: 'セキュリティ', whyItMatters: '権限の扱いが変わる' },
  ],
};

function ready(
  overrides: Partial<Extract<HomeDailyDigestData, { status: 'ready' }>> = {}
): HomeDailyDigestData {
  return {
    status: 'ready',
    freshness: 'latest',
    reportDate: '2026-10-04',
    expectedDate: '2026-10-04',
    // 2026-10-05 14:35 JST
    generatedAt: '2026-10-05T05:35:00.000Z',
    summary: SUMMARY,
    summaryIssue: null,
    ...overrides,
  };
}

describe('HomeDailyDigest（issue #721）', () => {
  it('core・注目トピック・レポートの日付・デイリーレポートへのリンクを出す', () => {
    render(<HomeDailyDigest digest={ready()} />);
    const section = screen.getByRole('region', { name: '今日の要点' });

    expect(section).toHaveTextContent(SUMMARY.core);
    const topics = within(
      screen.getByRole('list', { name: '注目トピック' })
    ).getAllByRole('listitem');
    expect(topics).toHaveLength(3);
    expect(topics[0]).toHaveTextContent('エージェント基盤');
    expect(topics[0]).toHaveTextContent('運用の負担が減る');

    expect(screen.getByTestId('data-freshness')).toHaveTextContent(
      '10月4日の記事を 10月5日 14:35 に集計'
    );
    expect(
      screen.getByRole('link', { name: 'デイリーレポートを読む' })
    ).toHaveAttribute('href', '/trends/daily');
    expect(screen.queryByTestId('home-daily-digest-note')).toBeNull();
  });

  it('前日分が未生成なら、前々日分を出していることを示す', () => {
    render(
      <HomeDailyDigest
        digest={ready({ freshness: 'pending', reportDate: '2026-10-03' })}
      />
    );
    expect(screen.getByTestId('home-daily-digest-note')).toHaveTextContent(
      '10月4日のレポートはまだできていないため、10月3日のレポートを出しています。'
    );
    expect(screen.getByTestId('data-freshness')).toHaveTextContent(
      '10月3日の記事を'
    );
    expect(screen.getByText(SUMMARY.core)).toBeInTheDocument();
  });

  it('古いレポートしか無ければ、生成が止まっていることを示す', () => {
    render(
      <HomeDailyDigest
        digest={ready({ freshness: 'stale', reportDate: '2026-09-29' })}
      />
    );
    expect(screen.getByTestId('home-daily-digest-note')).toHaveTextContent(
      '最新のレポートは9月29日分で、それ以降のレポートができていません。'
    );
    expect(screen.getByText(SUMMARY.core)).toBeInTheDocument();
  });

  it('要点の生成に失敗したレポートは、失敗を示してデイリーレポートへ案内する', () => {
    render(
      <HomeDailyDigest
        digest={ready({ summary: null, summaryIssue: 'missing' })}
      />
    );
    expect(
      screen.getByText(/このレポートは要点を生成できませんでした/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '注目トピック' })).toBeNull();
    expect(screen.getByTestId('data-freshness')).toHaveTextContent('10月4日');
    expect(
      screen.getByRole('link', { name: 'デイリーレポートを読む' })
    ).toBeInTheDocument();
  });

  it('要点がホームで出せない形式なら、生成失敗とは別の文言で案内する', () => {
    render(
      <HomeDailyDigest
        digest={ready({ summary: null, summaryIssue: 'unsupported' })}
      />
    );
    expect(
      screen.getByText(/このレポートの要点は、ホームでは表示できない形式です/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/要点を生成できませんでした/)).toBeNull();
    expect(
      screen.getByRole('link', { name: 'デイリーレポートを読む' })
    ).toBeInTheDocument();
  });

  it('レポートが1件も無いときは、まだ無いことを示す', () => {
    render(<HomeDailyDigest digest={{ status: 'none' }} />);
    expect(
      screen.getByText(/デイリーレポートはまだありません/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('data-freshness')).toBeNull();
  });

  it('読み込みに失敗したら、失敗を示して再読み込みできる', () => {
    render(<HomeDailyDigest digest={{ status: 'error' }} />);
    expect(
      screen.getByText('今日の要点を読み込めませんでした。')
    ).toBeInTheDocument();
    screen.getByRole('button', { name: '再読み込み' }).click();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
