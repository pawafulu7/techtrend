'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Clock, 
  CheckCircle2, 
  BookOpen,
  ExternalLink,
  MoreVertical,
  Trash2,
  Edit,
  FolderOpen
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useReadingListActions } from '@/lib/reading-list/hooks';
import { ReadingListItem as ReadingListItemType } from '@/lib/reading-list/db';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';

interface ReadingListItemProps {
  item: ReadingListItemType;
  viewMode: 'grid' | 'list';
}

export function ReadingListItem({ item, viewMode }: ReadingListItemProps) {
  const { updateStatus, removeFromReadingList } = useReadingListActions();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleStatusChange = async (status: ReadingListItemType['status']) => {
    try {
      await updateStatus(item.articleId, status);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この記事を読書リストから削除しますか？')) return;
    
    setIsDeleting(true);
    try {
      await removeFromReadingList(item.articleId);
    } catch (error) {
      console.error('Failed to remove from reading list:', error);
      setIsDeleting(false);
    }
  };

  const getStatusIcon = () => {
    switch (item.status) {
      case 'reading':
        return <Clock className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <BookOpen className="h-4 w-4" />;
    }
  };

  const getStatusLabel = () => {
    switch (item.status) {
      case 'reading':
        return '読書中';
      case 'completed':
        return '読了';
      default:
        return '未読';
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'reading':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const content = (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="text-sm font-semibold line-clamp-2 mb-2">
              <Link 
                href={`/articles/${item.articleId}`}
                className="hover:text-primary transition-colors"
              >
                {item.title}
              </Link>
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {item.source}
              </Badge>
              <span>{formatDate(item.addedAt)}</span>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStatusChange('unread')}>
                <BookOpen className="h-4 w-4 mr-2" />
                未読にする
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange('reading')}>
                <Clock className="h-4 w-4 mr-2" />
                読書中にする
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange('completed')}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                読了にする
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={item.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  元記事を開く
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleDelete}
                className="text-destructive"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent>
        {item.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {item.summary}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={cn("text-xs", getStatusColor())}
          >
            {getStatusIcon()}
            <span className="ml-1">{getStatusLabel()}</span>
          </Badge>

          {item.progress !== undefined && item.progress > 0 && (
            <div className="flex items-center gap-2">
              <Progress value={item.progress} className="w-20 h-2" />
              <span className="text-xs text-muted-foreground">
                {item.progress}%
              </span>
            </div>
          )}
        </div>

        {item.notes && (
          <div className="mt-3 p-2 bg-muted rounded text-xs">
            {item.notes}
          </div>
        )}
      </CardContent>
    </>
  );

  if (viewMode === 'list') {
    return (
      <Card className={cn("transition-opacity", isDeleting && "opacity-50")}>
        <div className="flex items-center gap-4 p-4">
          <div className="flex-1">{content}</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-opacity", isDeleting && "opacity-50")}>
      {content}
    </Card>
  );
}