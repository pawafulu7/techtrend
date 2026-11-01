'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { getSignInErrorMessage } from '@/lib/auth/error-messages';
import { useRouter } from 'next/navigation';
import {
  EMAIL_VERIFICATION_CALLBACK_URL,
  sanitizeCallbackUrl,
} from '@/lib/routes/auth';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

type LoginFormData = {
  email: string;
  password: string;
};

interface LoginFormProps {
  callbackUrl?: string;
}

type ResendState = 'idle' | 'sending' | 'sent' | 'failed';

export function LoginForm({ callbackUrl = '/' }: LoginFormProps) {
  const safeUrl = sanitizeCallbackUrl(callbackUrl);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // パスワードは合っているが、メールアドレスの確認が済んでいないアカウント
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    setUnverifiedEmail(null);
    setResendState('idle');

    try {
      // callbackURL は渡さない。渡すと Better Auth のクライアントが成功時にそこへ遷移する
      const { error: signInError } = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (signInError?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(data.email);
      } else if (signInError) {
        setError(getSignInErrorMessage(signInError));
      } else {
        router.push(safeUrl);
        router.refresh();
      }
    } catch {
      setError('ログイン中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResendState('sending');
    try {
      const { error: resendError } = await authClient.sendVerificationEmail({
        email: unverifiedEmail,
        callbackURL: EMAIL_VERIFICATION_CALLBACK_URL,
      });
      setResendState(resendError ? 'failed' : 'sent');
    } catch {
      setResendState('failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {unverifiedEmail && (
        <Alert className="border-[var(--tt-color-warning-border)] bg-[var(--tt-color-warning-bg)]">
          <AlertDescription className="space-y-3 text-[var(--tt-color-text)]">
            <p>
              メールアドレスの確認が済んでいません。確認メールのリンクを開いて確認を済ませてから、もう一度ログインしてください。
            </p>
            {resendState === 'sent' ? (
              <p>確認メールを再送信しました。</p>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendState === 'sending'}
                >
                  {resendState === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      送信中...
                    </>
                  ) : (
                    '確認メールを再送信'
                  )}
                </Button>
                {resendState === 'failed' && (
                  <p>
                    確認メールを再送信できませんでした。しばらくしてからもう一度お試しください。
                  </p>
                )}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
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
          autoComplete="current-password"
          placeholder="********"
          {...register('password', {
            required: 'パスワードを入力してください',
            minLength: {
              value: 6,
              message: 'パスワードは6文字以上である必要があります',
            },
          })}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-destructive text-sm">{errors.password.message}</p>
        )}
      </div>

      {/* 再送の通信中にログインし直すと、古い再送の結果が新しい案内に出てしまうので止める */}
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || resendState === 'sending'}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ログイン中...
          </>
        ) : (
          'ログイン'
        )}
      </Button>
    </form>
  );
}
