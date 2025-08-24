'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MarkAllReadButtonProps {
  unreadCount: number;
  onMarkAllRead: () => Promise<any>;
  disabled?: boolean;
}

export function MarkAllReadButton({ 
  unreadCount, 
  onMarkAllRead,
  disabled = false
}: MarkAllReadButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 通知を3秒後に自動的に消す
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) {
      setNotification({
        message: '未読記事がありません',
        type: 'error'
      });
      return;
    }

    setShowConfirm(true);
  };

  const confirmMarkAllRead = async () => {
    setIsMarking(true);
    try {
      const result = await onMarkAllRead();
      setNotification({
        message: `${result?.markedCount || unreadCount}件の記事を既読にしました`,
        type: 'success'
      });
      setShowConfirm(false);
    } catch (error) {
      setNotification({
        message: '一括既読処理に失敗しました',
        type: 'error'
      });
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <>
      {/* 通知メッセージ */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md shadow-lg ${
          notification.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleMarkAllRead}
        disabled={disabled || isMarking || unreadCount === 0}
        className="flex items-center gap-2 relative"
        title="全ての未読記事を既読にする"
      >
        <CheckCheck className="h-4 w-4" />
        <span className="hidden sm:inline">全て既読</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>全ての未読記事を既読にしますか？</DialogTitle>
            <DialogDescription>
              {unreadCount}件の未読記事を全て既読にマークします。
              この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isMarking}
            >
              キャンセル
            </Button>
            <Button 
              onClick={confirmMarkAllRead}
              disabled={isMarking}
            >
              {isMarking ? '処理中...' : '既読にする'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}