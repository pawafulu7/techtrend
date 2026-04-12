'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  CONFIRMATION_WORD,
  type DeleteAccountRequest,
  type DeleteAccountResult,
} from '@/types/api/delete-account';

interface DeleteAccountDialogProps {
  hasPassword: boolean;
}

export function DeleteAccountDialog({ hasPassword }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmationWord, setConfirmationWord] = useState('');
  const [reason, setReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      // Validate confirmation word before sending (type safety)
      if (confirmationWord !== CONFIRMATION_WORD) {
        toast({
          title: '確認ワードが正しくありません',
          description: `"${CONFIRMATION_WORD}" と正確に入力してください`,
          variant: 'destructive',
        });
        setIsDeleting(false);
        return;
      }

      const requestBody: DeleteAccountRequest = {
        password: hasPassword ? password : undefined,
        confirmationWord: CONFIRMATION_WORD,
        reason: reason || undefined,
      };

      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data: DeleteAccountResult = await response.json();

      if (!response.ok || !data.success) {
        // Validate error response structure
        if (
          !data ||
          typeof data !== 'object' ||
          !('error' in data) ||
          !('message' in data)
        ) {
          toast({
            title: 'エラーが発生しました',
            description: 'もう一度お試しください',
            variant: 'destructive',
          });
          return;
        }

        const errorData = data;

        if (errorData.error === 'INVALID_PASSWORD') {
          setPassword('');
          toast({
            title: 'パスワードが正しくありません',
            description: errorData.message,
            variant: 'destructive',
          });
        } else if (errorData.error === 'INVALID_CONFIRMATION') {
          toast({
            title: '確認ワードが正しくありません',
            description: `"${CONFIRMATION_WORD}" と正確に入力してください`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'エラーが発生しました',
            description: errorData.message || 'アカウント削除に失敗しました',
            variant: 'destructive',
          });
        }
        return;
      }

      toast({
        title: 'アカウントを削除しました',
        description: 'ご利用ありがとうございました',
        variant: 'default',
      });

      setOpen(false);

      // Handle sign out with error recovery
      try {
        await authClient.signOut();
        window.location.href = '/';
      } catch (signOutError) {
        console.error('Sign out failed after account deletion:', signOutError);
        // Even if sign out fails, the account is deleted, so redirect manually
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Account deletion failed:', error);
      toast({
        title: 'エラーが発生しました',
        description: 'もう一度お試しください',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isValid =
    confirmationWord === CONFIRMATION_WORD &&
    (!hasPassword || password.length > 0);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setPassword('');
      setConfirmationWord('');
      setReason('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          data-test="delete-account-button"
        >
          アカウントを削除
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>アカウントの削除</DialogTitle>
          <DialogDescription>
            この操作は取り消すことができません。慎重に確認してください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>削除されるデータ:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
                <li>プロフィール情報</li>
                <li>お気に入り記事</li>
                <li>閲覧履歴</li>
                <li>OAuth連携情報</li>
              </ul>
            </AlertDescription>
          </Alert>

          {hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="password">現在のパスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                disabled={isDeleting}
                autoComplete="current-password"
                data-test="delete-password-input"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirmation">
              確認のため &quot;{CONFIRMATION_WORD}&quot; と入力してください
            </Label>
            <Input
              id="confirmation"
              type="text"
              value={confirmationWord}
              onChange={(e) => setConfirmationWord(e.target.value)}
              placeholder={CONFIRMATION_WORD}
              disabled={isDeleting}
              autoComplete="off"
              data-test="delete-confirmation-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">削除理由（任意）</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="削除理由をお聞かせください（サービス改善のため）"
              disabled={isDeleting}
              maxLength={500}
              rows={3}
              data-test="delete-reason-textarea"
            />
            <p className="text-muted-foreground text-right text-xs">
              {reason.length}/500
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
            data-test="delete-cancel-button"
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isValid || isDeleting}
            data-test="delete-confirm-button"
          >
            {isDeleting ? '削除中...' : 'アカウントを削除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
