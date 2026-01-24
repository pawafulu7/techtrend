'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
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

  // URL state
  const [filters, setFilters] = useState<FiltersState>({
    status: (searchParams.get('status') as SocialPostStatus | 'all') || 'all',
    source: (searchParams.get('source') as SocialPostSource | 'all') || 'all',
    page: Number(searchParams.get('page')) || 1,
  });

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);

  // Build API URL
  const apiUrl = `/api/admin/social-posts?${new URLSearchParams({
    status: filters.status,
    source: filters.source,
    page: String(filters.page),
    limit: '20',
  }).toString()}`;

  // Fetch data
  const { data, error, isLoading, mutate } = useSWR<
    PaginatedResult<SocialPost>
  >(
    apiUrl,
    fetcher,
    { refreshInterval: 30000 } // 30秒ごとに自動更新
  );

  // Update URL when filters change
  const updateFilters = useCallback(
    (newFilters: Partial<FiltersState>) => {
      const updated = { ...filters, ...newFilters };
      setFilters(updated);

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
      if (selectedIds.size === 0) return;

      const confirmed =
        action === 'delete'
          ? window.confirm(`${selectedIds.size}件の投稿を削除しますか？`)
          : true;

      if (!confirmed) return;

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
        mutate();
      } catch (error) {
        console.error('Bulk action failed:', error);
        alert('操作に失敗しました');
      }
    },
    [selectedIds, mutate]
  );

  // Delete single post
  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('この投稿を削除しますか？')) return;

      try {
        const res = await fetch(`/api/admin/social-posts/${id}`, {
          method: 'DELETE',
        });

        if (!res.ok) throw new Error('Delete failed');

        mutate();
      } catch (error) {
        console.error('Delete failed:', error);
        alert('削除に失敗しました');
      }
    },
    [mutate]
  );

  // Copy to clipboard
  const handleCopy = useCallback(async (post: SocialPost) => {
    const text = `${post.content}\n\n${post.sourceUrls.join('\n')}\n\n${post.hashtags.join(' ')}`;
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
  const handleGenerateComplete = useCallback(() => {
    setIsGenerateDialogOpen(false);
    mutate();
  }, [mutate]);

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">X投稿管理</h1>
          <p className="text-muted-foreground">
            投稿コンテンツの生成・編集・管理
          </p>
        </div>
      </div>

      {/* Status Counts */}
      <StatusCounts />

      {/* Toolbar */}
      <SocialPostsToolbar
        filters={filters}
        onFilterChange={updateFilters}
        selectedCount={selectedIds.size}
        onBulkAction={handleBulkAction}
        onGenerateClick={() => setIsGenerateDialogOpen(true)}
      />

      {/* Table */}
      {error ? (
        <div className="text-destructive py-10 text-center">
          データの取得に失敗しました
        </div>
      ) : isLoading ? (
        <div className="text-muted-foreground py-10 text-center">
          読み込み中...
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
  );
}
