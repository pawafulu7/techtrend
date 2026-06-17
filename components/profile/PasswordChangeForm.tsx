'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'パスワードの変更に失敗しました');
      }

      // Success toast
      toast({
        title: '✓ 変更完了',
        description: 'パスワードを変更しました',
      });

      // フォームをリセット
      reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'パスワードの変更に失敗しました',
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
