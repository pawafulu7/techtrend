'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui-v2/button-v2';
import { Settings, Trash2, AlertTriangle } from 'lucide-react';
import { analyticsTracker } from '@/lib/analytics/tracking';
import { useRouter } from 'next/navigation';

export function AnalyticsSettings() {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDisableAnalytics = async () => {
    await analyticsTracker.disable();
    router.push('/');
  };

  const handleDeleteData = async () => {
    setIsDeleting(true);
    try {
      await analyticsTracker.clearAllData();
      setShowDeleteConfirm(false);
      // データ削除後にページをリロード
      window.location.reload();
    } catch {
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>読書分析設定</DialogTitle>
          <DialogDescription>読書分析機能の設定を管理します</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="text-h3">プライバシー</h3>
            <p className="text-muted-foreground text-sm">
              すべてのデータはブラウザのローカルストレージに保存されます。
              サーバーには一切送信されません。
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-h3">データ管理</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                すべてのデータを削除
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleDisableAnalytics}
              >
                読書分析を無効にする
              </Button>
            </div>
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="border-destructive/50 bg-destructive/10 space-y-2 rounded-md border p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-destructive mt-0.5 h-5 w-5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">本当に削除しますか？</p>
                <p className="text-muted-foreground text-sm">
                  この操作は取り消せません。すべての読書データが削除されます。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteData}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除する'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
