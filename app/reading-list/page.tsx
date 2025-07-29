'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  FolderOpen,
  Filter,
  LayoutGrid,
  List,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useReadingList, useReadingStats } from '@/lib/reading-list/hooks';
import { ReadingListItem } from '@/app/components/reading-list/ReadingListItem';
import { ReadingListStats } from '@/app/components/reading-list/ReadingListStats';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'unread' | 'reading' | 'completed';

export default function ReadingListPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  const { items, loading, error } = useReadingList(
    statusFilter === 'all' ? undefined : { status: statusFilter }
  );
  const { stats } = useReadingStats();

  const getStatusIcon = (status: StatusFilter) => {
    switch (status) {
      case 'unread':
        return <BookOpen className="h-4 w-4" />;
      case 'reading':
        return <Clock className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <FolderOpen className="h-4 w-4" />;
    }
  };

  const getStatusLabel = (status: StatusFilter) => {
    switch (status) {
      case 'unread':
        return '未読';
      case 'reading':
        return '読書中';
      case 'completed':
        return '読了';
      default:
        return 'すべて';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                記事一覧に戻る
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">読書リスト</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 統計情報 */}
        {stats && <ReadingListStats stats={stats} />}
      </div>

      {/* フィルタータブ */}
      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            {getStatusIcon('all')}
            {getStatusLabel('all')}
            {stats && (
              <Badge variant="secondary" className="ml-1">
                {stats.totalItems}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread" className="flex items-center gap-2">
            {getStatusIcon('unread')}
            {getStatusLabel('unread')}
            {stats && (
              <Badge variant="secondary" className="ml-1">
                {stats.unreadItems}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reading" className="flex items-center gap-2">
            {getStatusIcon('reading')}
            {getStatusLabel('reading')}
            {stats && (
              <Badge variant="secondary" className="ml-1">
                {stats.readingItems}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            {getStatusIcon('completed')}
            {getStatusLabel('completed')}
            {stats && (
              <Badge variant="secondary" className="ml-1">
                {stats.completedItems}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-0">
          {loading ? (
            <div className={cn(
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-4"
            )}>
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  読書リストの読み込みに失敗しました
                </p>
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {statusFilter === 'all' 
                    ? '読書リストに記事がありません'
                    : `${getStatusLabel(statusFilter)}の記事がありません`
                  }
                </p>
                <Button asChild>
                  <Link href="/">
                    <Plus className="h-4 w-4 mr-2" />
                    記事を探す
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className={cn(
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-4"
            )}>
              {items.map((item) => (
                <ReadingListItem 
                  key={item.id} 
                  item={item} 
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}