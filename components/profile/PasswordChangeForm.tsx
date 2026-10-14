'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { commonActionErrorMessage } from './profile-action-errors';

const PASSWORD_CHANGE_FAILED_MESSAGE =
  'パスワードを変更できませんでした。時間をおいて再試行してください';

// サーバーの文言（英語・内部向け）はそのまま出さず、ステータスとコードから選ぶ（issue #729）
function passwordChangeErrorMessage(status: number, body: unknown): string {
  const code =
    body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  if (code === 'INVALID_CURRENT_PASSWORD') {
    return '現在のパスワードが正しくありません';
  }
  if (status === 400) {
    return '入力内容を確認してください。新しいパスワードは8〜72文字で、大文字・小文字・数字を含めてください';
  }
  if (status === 409) {
    return '別の操作でパスワードが変更されました。ページを再読み込みしてからやり直してください';
  }
  return commonActionErrorMessage(status) ?? PASSWORD_CHANGE_FAILED_MESSAGE;
}

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function PasswordChangeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<PasswordFormData>();

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form requires reading watch() return value outside hook scope
  const newPassword = watch('newPassword');

  const onSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        // 本文が JSON でない（プロキシのエラーページなど）ときも、ステータスから文言を選ぶ
        const result: unknown = await response.json().catch(() => null);
        toast({
          variant: 'destructive',
          title: 'エラー',
          description: passwordChangeErrorMessage(response.status, result),
        });
        return;
      }

      // Success toast
      toast({
        title: '✓ 変更完了',
        description:
          'パスワードを変更しました。他の端末のセッションは無効になりました',
      });

      // フォームをリセット
      reset();
    } catch {
      // 通信の失敗。例外の文言（Failed to fetch など）は出さない
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: PASSWORD_CHANGE_FAILED_MESSAGE,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">現在のパスワード</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...register('currentPassword', {
            required: '現在のパスワードを入力してください',
          })}
          disabled={isLoading}
          placeholder="現在のパスワード"
        />
        {errors.currentPassword && (
          <p className="text-destructive text-sm">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">新しいパスワード</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register('newPassword', {
            required: '新しいパスワードを入力してください',
            minLength: {
              value: 8,
              message: 'パスワードは8文字以上である必要があります',
            },
            maxLength: {
              value: 72,
              message: 'パスワードは72文字以下である必要があります',
            },
            pattern: {
              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
              message: 'パスワードは大文字、小文字、数字を含む必要があります',
            },
          })}
          disabled={isLoading}
          placeholder="新しいパスワード（8文字以上）"
        />
        {errors.newPassword && (
          <p className="text-destructive text-sm">
            {errors.newPassword.message}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          8文字以上で、大文字、小文字、数字を含めてください
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword', {
            required: 'パスワード確認を入力してください',
            validate: (value) =>
              value === newPassword || 'パスワードが一致しません',
          })}
          disabled={isLoading}
          placeholder="新しいパスワード（確認）"
        />
        {errors.confirmPassword && (
          <p className="text-destructive text-sm">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            変更中...
          </>
        ) : (
          'パスワードを変更'
        )}
      </Button>
    </form>
  );
}
