'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionSelector } from './version-selector';
import { CategorySection } from './category-section';

type Category = 'FEATURE' | 'BUGFIX' | 'IMPROVEMENT' | 'OTHER';

interface Entry {
  id: string;
  content: string;
  titleJa?: string | null;
  contentJa?: string | null;
  category: Category;
  orderIndex: number;
}

interface Version {
  id: string;
  version: string;
  sortOrder: number;
  createdAt: string;
  entryCount: number;
}

interface Project {
  id: string;
  slug: string;
  name: string;
  sourceUrl: string | null;
  iconUrl: string | null;
}

interface ChangelogResponse {
  project: Project;
  versions: Version[];
  entries: Entry[];
  categoryCounts: Record<string, number>;
}

const CATEGORY_ORDER: Category[] = [
  'FEATURE',
  'BUGFIX',
  'IMPROVEMENT',
  'OTHER',
];

async function fetchChangelog(
  project: string,
  version?: string,
  signal?: AbortSignal
): Promise<ChangelogResponse> {
  const params = new URLSearchParams({ project });
  if (version) params.set('version', version);

  const res = await fetch(`/api/changelog?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch changelog: ${res.status}`);
  }
  return res.json();
}

export function ChangelogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const project = searchParams.get('project') || 'claude-code';
  const version = searchParams.get('version') || undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ['changelog', project, version],
    queryFn: ({ signal }) => fetchChangelog(project, version, signal),
    staleTime: 5 * 60 * 1000,
  });

  const handleVersionChange = useCallback(
    (newVersion: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('version', newVersion);
      router.push(`/changelog?${params.toString()}`);
    },
    [router, searchParams]
  );

  const entriesByCategory = useMemo(() => {
    if (!data?.entries) return new Map<Category, Entry[]>();

    const map = new Map<Category, Entry[]>();
    for (const category of CATEGORY_ORDER) {
      map.set(category, []);
    }
    for (const entry of data.entries) {
      const cat = entry.category as Category;
      const list = map.get(cat);
      if (list) {
        list.push(entry);
      } else {
        const otherList = map.get('OTHER');
        if (otherList) otherList.push({ ...entry, category: 'OTHER' });
      }
    }
    return map;
  }, [data?.entries]);

  if (isLoading) {
    return <ChangelogSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-[var(--tt-color-negative-border)] bg-[var(--tt-color-negative-bg)] p-6 text-center">
          <p className="text-sm text-[var(--tt-color-negative)]">
            Changelog
            の読み込みに失敗しました。しばらくしてから再度お試しください。
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentVersion =
    version || (data.versions.length > 0 ? data.versions[0].version : '');
  const totalEntries = data.entries.length;

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
      {/* Page Header */}
      <header className="mb-10">
        <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--tt-color-primary)] text-[var(--tt-color-on-primary)]">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--tt-color-text)] sm:text-3xl">
                {data.project.name}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--tt-color-text)]">
                リリースノート / 変更履歴
              </p>
            </div>
          </div>

          {currentVersion && (
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 self-start border-[var(--tt-color-primary)] px-3 py-1 text-sm text-[var(--tt-color-primary)]"
            >
              <Package className="size-3.5" aria-hidden="true" />v
              {currentVersion}
            </Badge>
          )}
        </div>

        {/* Controls Row */}
        <div className="flex flex-col gap-4 border-t border-[var(--tt-color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          {data.versions.length > 0 && (
            <VersionSelector
              versions={data.versions}
              currentVersion={currentVersion}
              onVersionChange={handleVersionChange}
            />
          )}

          <p className="text-sm text-[var(--tt-color-text)] tabular-nums">
            {totalEntries} 件の変更
          </p>
        </div>
      </header>

      {/* Category Sections */}
      <div className="fade-in-content space-y-10">
        {CATEGORY_ORDER.map((category) => {
          const entries = entriesByCategory.get(category) || [];
          return (
            <CategorySection
              key={category}
              category={category}
              entries={entries}
            />
          );
        })}
      </div>

      {/* Empty State */}
      {totalEntries === 0 && (
        <div className="py-20 text-center">
          <FileText className="mx-auto mb-4 size-12 text-[var(--tt-color-text-muted)] opacity-40" />
          <p className="text-[var(--tt-color-text-muted)]">
            このバージョンには変更履歴がありません
          </p>
        </div>
      )}
    </div>
  );
}

export function ChangelogSkeleton() {
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
      {/* Header skeleton */}
      <header className="mb-10">
        <div className="mb-3 flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--tt-color-border)] pt-4">
          <Skeleton className="h-10 w-[220px]" />
          <Skeleton className="h-4 w-20" />
        </div>
      </header>

      {/* Category sections skeleton */}
      {[1, 2, 3].map((section) => (
        <div key={section} className="mb-10 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3].map((card) => (
              <Skeleton key={card} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
