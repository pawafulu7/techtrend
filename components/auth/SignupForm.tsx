'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

type SignupFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormData>();

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form requires reading watch() return value outside hook scope
  const password = watch('password');

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Create user account and auto sign in
      const { error: signUpError } = await authClient.signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      if (signUpError) {
        setError(signUpError.message || '登録中にエラーが発生しました');
        return;
      }

      router.push('/profile');
      router.refresh();
    } catch {
      setError('登録中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">お名前</Label>
        <Input
          id="name"
          type="text"
          placeholder="山田 太郎"
          {...register('name', {
            required: 'お名前を入力してください',
            minLength: {
              value: 2,
              message: 'お名前は2文字以上である必要があります',
            },
          })}
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
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
          <p className="text-destructive text-sm">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          type="password"
          placeholder="********"
          {...register('password', {
            required: 'パスワードを入力してください',
            minLength: {
              value: 8,
              message: 'パスワードは8文字以上である必要があります',
            },
            pattern: {
              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
              message: 'パスワードは大文字、小文字、数字を含む必要があります',
            },
          })}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-destructive text-sm">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">パスワード（確認）</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="********"
          {...register('confirmPassword', {
            required: 'パスワードを再入力してください',
            validate: (value) =>
              value === password || 'パスワードが一致しません',
          })}
          disabled={isLoading}
        />
        {errors.confirmPassword && (
          <p className="text-destructive text-sm">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            登録中...
          </>
        ) : (
          'アカウントを作成'
        )}
      </Button>
    </form>
  );
}
