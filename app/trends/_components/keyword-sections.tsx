import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { getTagDisplayName } from '@/lib/constants/tag-labels';
import { cn } from '@/lib/utils';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { ErrorState } from '@/components/ui-v2/error-state';
import { TrendingTopicRow } from '@/app/components/trends/overview/TrendingTopicRow';
import { DataFreshness } from '@/app/components/common/data-freshness';
import type { TrendingKeyword, NewTag } from './trends-data';

export const RETRY_DESCRIPTION = '時間をおいて再試行してください。';

interface RetryProps {
  onRetry: () => void;
  retrying: boolean;
}

// 見出し・集計時刻・空の表示をページの下地に直接置かず、分析のカードと同じ枠に入れる（issue #763）
function SectionCard({
  icon: Icon,
  iconClassName,
  title,
  children,
}: {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-background rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', iconClassName)} aria-hidden="true" />
        <h2 className="text-foreground text-h3">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// null はサーバーでの取得の失敗。空配列（該当なし）とは別に表示する（issue #701）
export function TrendingKeywordsSection({
  keywords,
  total,
  aggregatedAt,
  onRetry,
  retrying,
}: RetryProps & {
  keywords: TrendingKeyword[] | null;
  /** 急上昇のタグの総数（keywords は上位だけ）。取得できなかったときは null */
  total?: number | null;
  /** 集計時刻（issue #707） */
  aggregatedAt?: string | null;
}) {
  return (
    <SectionCard
      icon={TrendingUp}
      iconClassName="text-tt-primary"
      title="いま伸びている話題"
    >
      {keywords === null ? (
        <ErrorState
          title="いま伸びている話題を読み込めませんでした"
          description={RETRY_DESCRIPTION}
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : (
        <>
          <div className="-mt-2 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <DataFreshness at={aggregatedAt} period="直近24時間" />
            {typeof total === 'number' && total > keywords.length && (
              <p className="text-xs text-(--tt-color-text-muted) tabular-nums">
                {`全 ${total} 件のうち、伸びの大きい順に上位 ${keywords.length} 件`}
              </p>
            )}
          </div>
          {keywords.length > 0 ? (
            // 順位表は1つの ol にし、2 列のときは縦に流す（1〜10 が左、11〜20 が右）。
            // Safari は list-style:none でリストの意味を落とすので role="list" を付ける
            <ol
              role="list"
              className="grid md:grid-flow-col md:grid-cols-2 md:grid-rows-(--trend-rows) md:gap-x-8"
              style={
                {
                  '--trend-rows': `repeat(${Math.ceil(keywords.length / 2)}, auto)`,
                } as CSSProperties
              }
            >
              {keywords.map((keyword, index) => (
                <TrendingTopicRow
                  key={keyword.id}
                  topic={keyword}
                  rank={index + 1}
                  // 2 列のときに左右の列を同時に描く（20 行を通しでずらすと描き終わるまで 1.4 秒かかる）
                  revealIndex={index % Math.ceil(keywords.length / 2)}
                  animate
                />
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={TrendingUp}
              size="compact"
              title="いま伸びている話題はありません"
              description="直近24時間の記事数が、前の6日の1日平均より大きく増えたタグ（2件以上）がここに出ます。"
            />
          )}
        </>
      )}
    </SectionCard>
  );
}

export function NewTagsSection({
  tags,
  onRetry,
  retrying,
}: RetryProps & { tags: NewTag[] | null }) {
  return (
    <SectionCard
      icon={Sparkles}
      iconClassName="text-(--tt-color-positive)"
      title={`新着タグ${tags ? ` (${tags.length})` : ''}`}
    >
      {tags === null ? (
        <ErrorState
          title="新着タグを読み込めませんでした"
          description={RETRY_DESCRIPTION}
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <BadgeV2 key={tag.id} variant="positive" asChild>
              <Link href={`/?tags=${encodeURIComponent(tag.name)}`}>
                {getTagDisplayName(tag.name)}
                <span className="ml-1">{tag.count}</span>
              </Link>
            </BadgeV2>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          size="compact"
          title="新着タグはありません"
          description="直近24時間に初めて使われたタグがここに出ます。"
        />
      )}
    </SectionCard>
  );
}
