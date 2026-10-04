import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { DataFreshness } from '@/app/components/common/data-freshness';
import { HomeDailyDigestReload } from '@/app/components/home/home-daily-digest-reload';
import type { HomeDailyDigest as HomeDailyDigestData } from '@/lib/services/trend-report/home-daily-digest';
import { cn } from '@/lib/utils';

const HEADING_ID = 'home-daily-digest-heading';
const DAILY_REPORT_PATH = '/trends/daily';

/** YYYY-MM-DD → 「10月4日」 */
function formatDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

function Shell({
  tone,
  children,
}: {
  tone: 'primary' | 'warning' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="home-daily-digest"
      className={cn(
        'mb-4 rounded-lg border border-l-4 border-(--tt-color-border) bg-(--tt-color-surface) px-4 py-3 sm:px-5 sm:py-4',
        tone === 'primary' && 'border-l-(--tt-color-primary)',
        tone === 'warning' && 'border-l-(--tt-color-warning)',
        tone === 'neutral' && 'border-l-(--tt-color-border-hover)'
      )}
    >
      {children}
    </section>
  );
}

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h2
        id={HEADING_ID}
        className="text-sm font-semibold text-(--tt-color-text)"
      >
        今日の要点
      </h2>
      {children}
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: 'muted' | 'warning';
  children: React.ReactNode;
}) {
  // 警告色の小さい文字は白背景でコントラストが足りないため、色はアイコンだけに付ける
  return (
    <p
      className={cn(
        'mt-1 flex items-start gap-1 text-xs',
        tone === 'muted'
          ? 'text-(--tt-color-text-muted)'
          : 'font-medium text-(--tt-color-text)'
      )}
      data-testid="home-daily-digest-note"
    >
      {tone === 'warning' && (
        <AlertTriangle
          className="mt-px h-3.5 w-3.5 shrink-0 text-(--tt-color-warning)"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </p>
  );
}

function ReportLink() {
  return (
    <Link
      href={DAILY_REPORT_PATH}
      className="text-sm font-medium text-(--tt-color-primary) underline-offset-4 hover:text-(--tt-color-primary-hover) hover:underline focus-visible:underline"
    >
      デイリーレポートを読む
    </Link>
  );
}

interface HomeDailyDigestProps {
  digest: HomeDailyDigestData;
}

/**
 * ホームの記事一覧の上に出す「今日の要点」（issue #721）。
 * デイリーレポートの中心テーマ（core）と注目トピックを出し、本体へ案内する。
 * レポートが未生成・古い・要点の生成に失敗・読み込み失敗を、それぞれ区別して出す。
 */
export function HomeDailyDigest({ digest }: HomeDailyDigestProps) {
  if (digest.status === 'error') {
    return (
      <Shell tone="neutral">
        <Heading />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-(--tt-color-text-muted)">
            今日の要点を読み込めませんでした。
          </p>
          <HomeDailyDigestReload />
        </div>
      </Shell>
    );
  }

  if (digest.status === 'none') {
    return (
      <Shell tone="neutral">
        <Heading />
        <p className="mt-1 text-sm text-(--tt-color-text-muted)">
          デイリーレポートはまだありません。
        </p>
      </Shell>
    );
  }

  const {
    freshness,
    reportDate,
    expectedDate,
    generatedAt,
    summary,
    summaryIssue,
  } = digest;
  const isStale = freshness === 'stale';

  return (
    <Shell tone={isStale || !summary ? 'warning' : 'primary'}>
      <Heading>
        <DataFreshness at={generatedAt} period={formatDateJP(reportDate)} />
      </Heading>

      {freshness === 'pending' && (
        <Note tone="muted">
          {formatDateJP(expectedDate)}
          のレポートはまだできていないため、
          {formatDateJP(reportDate)}のレポートを出しています。
        </Note>
      )}
      {isStale && (
        <Note tone="warning">
          最新のレポートは{formatDateJP(reportDate)}
          分で、それ以降のレポートができていません。
        </Note>
      )}

      {summary ? (
        <>
          <p className="mt-2 text-base leading-relaxed font-semibold text-(--tt-color-text) sm:text-lg">
            {summary.core}
          </p>
          {summary.keyTopics.length > 0 && (
            <ul
              aria-label="注目トピック"
              className="mt-3 grid gap-2.5 sm:grid-cols-3 sm:gap-0"
            >
              {summary.keyTopics.map((topic, index) => (
                <li
                  key={`${index}-${topic.topic}`}
                  className={cn(
                    index > 0 &&
                      'sm:border-l sm:border-(--tt-color-border) sm:pl-4',
                    index < summary.keyTopics.length - 1 && 'sm:pr-4'
                  )}
                >
                  <p className="text-sm font-medium text-(--tt-color-text)">
                    {topic.topic}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-(--tt-color-text-muted)">
                    {topic.whyItMatters}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-(--tt-color-text-muted)">
          {summaryIssue === 'unsupported'
            ? 'このレポートの要点は、ホームでは表示できない形式です。デイリーレポートで読めます。'
            : 'このレポートは要点を生成できませんでした。記事のランキングと分野の内訳はデイリーレポートで見られます。'}
        </p>
      )}

      <div className="mt-3">
        <ReportLink />
      </div>
    </Shell>
  );
}
