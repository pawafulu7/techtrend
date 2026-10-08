'use client';

import { useId } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  buildFilterUrl,
  clearTransientFilterParams,
} from '@/lib/utils/url/filter-params';

/** 技術者向けでない記事も含めるかを表す URL パラメータ（issue #722） */
export const INCLUDE_OFF_TOPIC_PARAM = 'includeOffTopic';

/**
 * 技術者向けでない記事（一般の経済・政治・事件など）を一覧に含めるかの切り替え。
 * 既定は外す。オンにすると URL に includeOffTopic=true を付け、API にそのまま渡る。
 */
export function OffTopicToggle({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();
  const checked = searchParams.get(INCLUDE_OFF_TOPIC_PARAM) === 'true';

  const handleChange = (next: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(INCLUDE_OFF_TOPIC_PARAM, 'true');
    } else {
      params.delete(INCLUDE_OFF_TOPIC_PARAM);
    }
    clearTransientFilterParams(params);
    router.push(buildFilterUrl(pathname, params), { scroll: false });
  };

  return (
    <div
      className={cn(
        'flex h-7 items-center justify-between gap-2 rounded-md border px-2',
        checked &&
          'border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)]',
        className
      )}
    >
      <label htmlFor={id} className="cursor-pointer text-xs whitespace-nowrap">
        技術以外の記事も表示
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={handleChange}
        data-testid="off-topic-toggle"
      />
    </div>
  );
}
