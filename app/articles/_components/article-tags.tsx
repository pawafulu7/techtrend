'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { getTagDisplayName } from '@/lib/constants/tag-labels';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';

/** 最初に出すタグの数（リーダーの MAX_VISIBLE_TAGS と同じ） */
const MAX_VISIBLE_TAGS = 5;

interface ArticleTagsProps {
  tags: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * 記事詳細のタグ。最初の 5 個だけ出し、残りは「+N」のボタンで開く。
 * 描いた後に幅を測って隠す方式は hydration の後に行が縮んで CLS になるので、数で切る。
 * 隠したタグのリンクは DOM に置かない（見えないリンクにフォーカスが行くため）
 */
export function ArticleTags({ tags }: ArticleTagsProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (tags.length === 0) return null;

  const hiddenCount = tags.length - MAX_VISIBLE_TAGS;
  const visibleTags = expanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS);

  return (
    <ul
      id={listId}
      role="list"
      aria-label="タグ"
      className="flex flex-wrap gap-2"
      data-testid="article-tags"
    >
      {visibleTags.map((tag) => (
        <li key={tag.id}>
          <BadgeV2 variant="outline" className="cursor-pointer" asChild>
            <Link href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}>
              {getTagDisplayName(tag.name)}
            </Link>
          </BadgeV2>
        </li>
      ))}
      {hiddenCount > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            className="badge-pill cursor-pointer border border-dashed border-(--tt-color-border-hover) text-(--tt-color-text-muted) transition-colors duration-150 hover:bg-(--tt-color-surface-hover) hover:text-(--tt-color-text) focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none"
            data-testid="article-tags-toggle"
          >
            {expanded ? (
              '折りたたむ'
            ) : (
              <>
                <span className="tabular-nums">+{hiddenCount}</span>
                <span className="sr-only"> 件のタグを表示</span>
              </>
            )}
          </button>
        </li>
      )}
    </ul>
  );
}
