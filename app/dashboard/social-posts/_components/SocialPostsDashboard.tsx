'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SocialPostsToolbar } from './SocialPostsToolbar';
import { SocialPostsTable } from './SocialPostsTable';
import { GeneratePostDialog } from './GeneratePostDialog';
import { StatusCounts } from './StatusCounts';
import type {
  SocialPost,
  SocialPostStatus,
  SocialPostSource,
  PaginatedResult,
} from '@/lib/social-post';

// =============================================================================
// Types
// =============================================================================

interface FiltersState {
  status: SocialPostStatus | 'all';
  source: SocialPostSource | 'all';
  page: number;
}

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch');
  }
  return res.json();
};

// =============================================================================
// Component
// =============================================================================

export function SocialPostsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse filters from URL search params with validation
  const parseFilters = useCallback((params: URLSearchParams): FiltersState => {
    const statusParam = params.get('status');
    const sourceParam = params.get('source');
    const pageParam = params.get('page');

    // Validate status parameter
    const validStatuses = [
      'DRAFT',
      'REVIEWED',
      'SCHEDULED',
      'POSTING',
      'POSTED',
      'FAILED',
      'ARCHIVED',
      'all',
    ] as const;
    const status = validStatuses.includes(
      statusParam as (typeof validStatuses)[number]
    )
      ? (statusParam as SocialPostStatus | 'all')
      : 'all';

    // Validate source parameter
    const validSources = [
      'ARTICLE',
      'DAILY_TREND',
      'DIFF_SUMMARY',
      'MANUAL',
      'OPINION',
      'all',
    ] as const;
    const source = validSources.includes(
      sourceParam as (typeof validSources)[number]
    )
      ? (sourceParam as SocialPostSource | 'all')
      : 'all';

    // Validate page parameter
    const pageNum = parseInt(pageParam || '1', 10);
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;

    return { status, source, page };
  }, []);

  // URL state with validation
  const [filters, setFilters] = useState<FiltersState>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );

  // Sync filters with URL changes (browser back/forward, external links)
  useEffect(() => {
    const parsed = parseFilters(new URLSearchParams(searchParams.toString()));
    setFilters(parsed);
  }, [searchParams, parseFilters]);

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Build API URL
  const apiUrl = `/api/admin/social-posts?${new URLSearchParams({
    status: filters.status,
    source: filters.source,
    page: String(filters.page),
    limit: '20',
  }).toString()}`;

  // Fetch data
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<PaginatedResult<SocialPost>>({
    queryKey: ['social-posts', filters.status, filters.source, filters.page],
    queryFn: () => fetcher(apiUrl),
    refetchInterval: 30000, // 30秒ごとに自動更新
  });

  // Update URL when filters change
  const updateFilters = useCallback(
    (newFilters: Partial<FiltersState>) => {
      // Reset page to 1 when status/source changes (unless page is explicitly set)
      const updated = {
        ...filters,
        ...newFilters,
        ...(newFilters.page === undefined &&
        (newFilters.status !== undefined || newFilters.source !== undefined)
          ? { page: 1 }
          : {}),
      };
      setFilters(updated);

      // Clear selection when filters change (including page changes)
      if (
        newFilters.status !== undefined ||
        newFilters.source !== undefined ||
        newFilters.page !== undefined
      ) {
        setSelectedIds(new Set());
      }

      // Update URL
      const params = new URLSearchParams();
      if (updated.status !== 'all') params.set('status', updated.status);
      if (updated.source !== 'all') params.set('source', updated.source);
      if (updated.page > 1) params.set('page', String(updated.page));

      const queryString = params.toString();
      router.push(queryString ? `?${queryString}` : '/dashboard/social-posts', {
        scroll: false,
      });
    },
    [filters, router]
  );

  // Selection handlers
  const handleSelectAll = useCallback(() => {
    if (!data?.items) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((p) => p.id)));
    }
  }, [data?.items, selectedIds.size]);

  const handleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Bulk actions
  const handleBulkAction = useCallback(
    async (action: 'changeStatus' | 'delete', status?: SocialPostStatus) => {
      if (selectedIds.size === 0 || isProcessing) return;

      // Guard: changeStatus requires a valid status
      if (action === 'changeStatus' && !status) {
        alert('変更するステータスを選択してください');
        return;
      }

      const confirmed =
        action === 'delete'
          ? window.confirm(`${selectedIds.size}件の投稿を削除しますか？`)
          : true;

      if (!confirmed) return;

      setIsProcessing(true);
      try {
        const res = await fetch('/api/admin/social-posts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ids: Array.from(selectedIds),
            ...(status && { status }),
          }),
        });

        if (!res.ok) throw new Error('Bulk action failed');

        setSelectedIds(new Set());
        await queryClient.invalidateQueries({ queryKey: ['social-posts'] });
        await queryClient.invalidateQueries({
          queryKey: ['social-posts-stats'],
        });
      } catch (error) {
        console.error('Bulk action failed:', error);
        alert('操作に失敗しました');
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedIds, queryClient, isProcessing]
  );

  // Delete single post
  const handleDelete = useCallback(
    async (id: string) => {
      if (isProcessing) return;
      if (!window.confirm('この投稿を削除しますか？')) return;

      setIsProcessing(true);
      try {
        const res = await fetch(`/api/admin/social-posts/${id}`, {
          method: 'DELETE',
        });

        if (!res.ok) throw new Error('Delete failed');

        await queryClient.invalidateQueries({ queryKey: ['social-posts'] });
        await queryClient.invalidateQueries({
          queryKey: ['social-posts-stats'],
        });
      } catch (error) {
        console.error('Delete failed:', error);
        alert('削除に失敗しました');
      } finally {
        setIsProcessing(false);
      }
    },
    [queryClient, isProcessing]
  );

  // Copy to clipboard
  const handleCopy = useCallback(async (post: SocialPost) => {
    const urls = post.sourceUrls?.join('\n') ?? '';
    const tags = post.hashtags?.join(' ') ?? '';
    const text = `${post.content}${urls ? `\n\n${urls}` : ''}${tags ? `\n\n${tags}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      alert('クリップボードにコピーしました');
    } catch (error) {
      console.error('Copy failed:', error);
      alert('コピーに失敗しました');
    }
  }, []);

  // Navigation
  const handleEdit = useCallback(
    (id: string) => {
      router.push(`/dashboard/social-posts/${id}`);
    },
    [router]
  );

  // Generation complete callback
  const handleGenerateComplete = useCallback(async () => {
    setIsGenerateDialogOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['social-posts'] });
    await queryClient.invalidateQueries({ queryKey: ['social-posts-stats'] });
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25">
              <XLogoIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">
                X投稿管理
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                投稿コンテンツの生成・編集・管理
              </p>
            </div>
          </div>
        </div>

        {/* Status Counts */}
        <div className="mb-6">
          <StatusCounts />
        </div>

        {/* Toolbar */}
        <div className="mb-4">
          <SocialPostsToolbar
            filters={filters}
            onFilterChange={updateFilters}
            selectedCount={selectedIds.size}
            onBulkAction={handleBulkAction}
            onGenerateClick={() => setIsGenerateDialogOpen(true)}
            isProcessing={isProcessing}
          />
        </div>

        {/* Table */}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-800 dark:bg-rose-950/30">
            <p className="text-rose-700 dark:text-rose-400">
              データの取得に失敗しました
            </p>
          </div>
        ) : isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <LoadingSpinner className="mx-auto h-8 w-8 text-sky-500" />
            <p className="mt-3 text-slate-500 dark:text-slate-400">
              読み込み中...
            </p>
          </div>
        ) : data ? (
          <SocialPostsTable
            posts={data.items}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCopy={handleCopy}
            pagination={{
              page: data.page,
              totalPages: data.totalPages,
              total: data.total,
            }}
            onPageChange={(page) => updateFilters({ page })}
          />
        ) : null}

        {/* Generate Dialog */}
        <GeneratePostDialog
          open={isGenerateDialogOpen}
          onOpenChange={setIsGenerateDialogOpen}
          onComplete={handleGenerateComplete}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function XLogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
