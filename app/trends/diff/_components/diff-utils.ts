import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import {
  canonicalTopicName,
  normalizeTopic,
  topicSearchTags,
} from '@/lib/ai/extraction/topic-classifier';

export interface ArticleInfo {
  id: string;
  title: string;
}

export interface DiffSummaryData {
  categorySlug: string;
  categoryName: string;
  currentPeriod: string;
  baselinePeriod: string;
  changes: DiffChange[];
  unchanged: string[];
  modelVersion: string;
  promptVersion: string;
  generatedAt: string;
}

export interface DiffSummaryResponse {
  success: boolean;
  week: string;
  previousWeek: string;
  data: DiffSummaryData[];
  meta: {
    totalCategories: number;
    summarizedCategories: number;
  };
  isFallback?: boolean;
  requestedWeek?: string;
}

export interface ChangeWithCategory extends DiffChange {
  category: string;
}

/** トピックの記事一覧へのリンク（併合した別名のタグも OR で検索する） */
export function topicSearchHref(topic: string): string {
  return `/?tags=${encodeURIComponent(topicSearchTags(topic).join(','))}&tagMode=OR`;
}

export function formatWeekDisplay(week: string): string {
  const match = week.match(/^(\d{4})-W(\d{2})$/);
  return match ? `${match[1]}年 第${parseInt(match[2], 10)}週` : week;
}

export interface GroupedChanges {
  new: ChangeWithCategory[];
  trending: ChangeWithCategory[];
  updated: ChangeWithCategory[];
  deprecated: ChangeWithCategory[];
}

export function getGroupedChanges(
  data: DiffSummaryResponse | null
): GroupedChanges {
  if (!data) return { new: [], trending: [], updated: [], deprecated: [] };

  const allChanges: ChangeWithCategory[] = data.data.flatMap((d) =>
    d.changes.map((c) => ({ ...c, category: d.categoryName }))
  );

  const typePriority: Record<DiffChange['type'], number> = {
    trending: 0,
    new: 1,
    updated: 2,
    deprecated: 3,
  };

  const groupedByKey = new Map<
    string,
    { changes: ChangeWithCategory[]; displayTopic: string }
  >();

  // カテゴリをまたぐ統合も分析と同じ照合キーで行う。
  // "code" や "api" などの語を取り除いてまとめると、Claude と Claude Code、
  // REST と REST API のような範囲の違うトピックが 1 枚になり、片方の変化が消える
  for (const change of allChanges) {
    const key = normalizeTopic(change.topic);
    if (!groupedByKey.has(key)) {
      groupedByKey.set(key, {
        changes: [],
        displayTopic: canonicalTopicName(change.topic),
      });
    }
    groupedByKey.get(key)!.changes.push(change);
  }

  const mergedChanges: ChangeWithCategory[] = [];

  for (const [, group] of groupedByKey) {
    const sorted = [...group.changes].sort(
      (a, b) => typePriority[a.type] - typePriority[b.type]
    );
    const best = sorted[0];
    const categories = new Set<string>();
    for (const c of group.changes) categories.add(c.category);
    mergedChanges.push({
      ...best,
      topic: group.displayTopic,
      category: Array.from(categories).join('、'),
    });
  }

  return {
    new: mergedChanges.filter((c) => c.type === 'new'),
    trending: mergedChanges.filter((c) => c.type === 'trending'),
    updated: mergedChanges.filter((c) => c.type === 'updated'),
    deprecated: mergedChanges.filter((c) => c.type === 'deprecated'),
  };
}
