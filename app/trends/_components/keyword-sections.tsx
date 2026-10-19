import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { getTagDisplayName } from '@/lib/constants/tag-labels';
import { cn } from '@/lib/utils';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { ErrorState } from '@/components/ui-v2/error-state';
import { TrendingKeywordCard } from '@/app/components/trends/overview/TrendingKeywordCard';
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
    <section className="bg-background rounded-lg border p-4 shadow-sm">
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
  aggregatedAt,
  onRetry,
  retrying,
}: RetryProps & {
  keywords: TrendingKeyword[] | null;
  /** 集計時刻（issue #707） */
  aggregatedAt?: string | null;
}) {
  return (
    <SectionCard
      icon={TrendingUp}
      iconClassName="text-tt-primary"
      title="急上昇キーワード"
    >
      {keywords === null ? (
        <ErrorState
          title="急上昇キーワードを読み込めませんでした"
          description={RETRY_DESCRIPTION}
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : (
        <>
          <DataFreshness
            at={aggregatedAt}
            period="直近24時間"
            className="-mt-2 mb-3"
          />
          {keywords.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {keywords.slice(0, 8).map((keyword) => (
                <TrendingKeywordCard key={keyword.id} keyword={keyword} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={TrendingUp}
              size="compact"
              title="急上昇キーワードはありません"
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
