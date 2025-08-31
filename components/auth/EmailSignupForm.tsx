'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, CheckCircle } from 'lucide-react';

type EmailSignupFormData = {
  email: string;
};

export function EmailSignupForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailSignupFormData>();

  const onSubmit = async (data: EmailSignupFormData) => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      // Use NextAuth's signIn with email provider
      const result = await signIn('email', {
        email: data.email,
        redirect: false,
        callbackUrl: '/',
      });

      if (result?.error) {
        setError('メール送信に失敗しました。もう一度お試しください。');
      } else {
        setIsSuccess(true);
      }
    } catch {
      setError('エラーが発生しました。しばらくしてからお試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-4">
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            確認メールを送信しました！
          </AlertDescription>
        </Alert>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            入力されたメールアドレスに認証リンクを送信しました。
            メールをご確認いただき、リンクをクリックして登録を完了してください。
          </p>
          <ul className="mt-3 text-xs text-gray-500 space-y-1">
            <li>• メールが届かない場合は、迷惑メールフォルダをご確認ください</li>
            <li>• リンクの有効期限は24時間です</li>
            <li>• 問題が続く場合は、もう一度お試しください</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email-signup">メールアドレス</Label>
        <Input
          id="email-signup"
          type="email"
          placeholder="name@example.com"
          {...register('email', {
            required: 'メールアドレスを入力してください',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: '有効なメールアドレスを入力してください',
            },
          })}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        認証リンクをメールで送信します。パスワードの設定は不要です。
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            送信中...
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            認証メールを送信
          </>
        )}
      </Button>
    </form>
  );
}