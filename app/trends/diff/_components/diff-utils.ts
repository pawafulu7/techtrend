import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';

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

export function formatWeekDisplay(week: string): string {
  const match = week.match(/^(\d{4})-W(\d{2})$/);
  return match ? `${match[1]}年 第${parseInt(match[2], 10)}週` : week;
}

export function getGroupedChanges(data: DiffSummaryResponse | null): {
  new: ChangeWithCategory[];
  trending: ChangeWithCategory[];
  updated: ChangeWithCategory[];
  deprecated: ChangeWithCategory[];
} {
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

  const normalizeTopicKey = (topic: string): string => {
    const modifiers = [
      'code',
      'sdk',
      'cli',
      'api',
      'framework',
      'library',
      'tool',
      'tools',
      'client',
      'server',
    ];
    let normalized = topic.toLowerCase().trim().replace(/\s+/g, ' ');
    for (const mod of modifiers) {
      normalized = normalized.replace(new RegExp(`\\b${mod}\\b`, 'g'), '');
    }
    return normalized.replace(/\s+/g, ' ').trim();
  };

  const groupedByKey = new Map<
    string,
    { changes: ChangeWithCategory[]; displayTopic: string }
  >();

  for (const change of allChanges) {
    const key = normalizeTopicKey(change.topic);
    if (!groupedByKey.has(key)) {
      groupedByKey.set(key, { changes: [], displayTopic: change.topic });
    }
    const group = groupedByKey.get(key)!;
    group.changes.push(change);
    if (change.topic.length < group.displayTopic.length) {
      group.displayTopic = change.topic;
    }
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
