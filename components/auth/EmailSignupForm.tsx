'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Mail,
  CheckCircle,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react';

type EmailSignupFormData = {
  email: string;
  password: string;
  confirmPassword: string;
};

// パスワード強度チェック関数
const checkPasswordStrength = (password: string) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
  };

  const strength = Object.values(requirements).filter(Boolean).length;
  return { requirements, strength };
};

// パスワードバリデーション関数
const validatePassword = (password: string) => {
  const { requirements } = checkPasswordStrength(password);
  const allRequirementsMet = Object.values(requirements).every(Boolean);

  if (!allRequirementsMet) {
    const missing: string[] = [];
    if (!requirements.minLength) missing.push('8文字以上');
    if (!requirements.hasUpperCase) missing.push('大文字');
    if (!requirements.hasLowerCase) missing.push('小文字');
    if (!requirements.hasNumber) missing.push('数字');
    if (!requirements.hasSpecial) missing.push('記号(!@#$%^&*等)');

    return `パスワードには以下を含める必要があります: ${missing.join('、')}`;
  }
  return true;
};

export function EmailSignupForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<EmailSignupFormData>();

  const password = watch('password');
  const passwordStrength = password ? checkPasswordStrength(password) : null;

  const onSubmit = async (data: EmailSignupFormData) => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      // First, create the user account with password
      const response = await fetch('/api/auth/register-with-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'アカウント作成に失敗しました。');
        return;
      }

      if (result.success) {
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
        <Alert className="border-[var(--tt-color-positive-border)] bg-[var(--tt-color-positive-bg)]">
          <CheckCircle className="h-4 w-4 text-[var(--tt-color-positive)]" />
          <AlertDescription className="text-[var(--tt-color-text)]">
            確認メールを送信しました！
          </AlertDescription>
        </Alert>
        <div className="rounded-lg bg-[var(--tt-color-surface-muted)] p-4">
          <p className="text-sm text-[var(--tt-color-text-muted)]">
            入力されたメールアドレスに認証リンクを送信しました。
            メールをご確認いただき、リンクをクリックして登録を完了してください。
          </p>
          <ul className="mt-3 space-y-1 text-xs text-[var(--tt-color-text-muted)]">
            <li>
              • メールが届かない場合は、迷惑メールフォルダをご確認ください
            </li>
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
          <p className="text-destructive text-sm">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">パスワード</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="大文字・小文字・数字・記号を含む8文字以上"
            {...register('password', {
              required: 'パスワードを入力してください',
              validate: validatePassword,
            })}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--tt-color-text-muted)] hover:text-[var(--tt-color-text)]"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-destructive text-sm">{errors.password.message}</p>
        )}

        {/* パスワード強度インジケーター */}
        {password && passwordStrength && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-1">
              <div className="text-xs text-[var(--tt-color-text-muted)]">
                強度:
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 w-8 rounded ${
                      passwordStrength.strength >= level
                        ? passwordStrength.strength === 5
                          ? 'bg-[var(--tt-color-positive)]'
                          : passwordStrength.strength >= 3
                            ? 'bg-[var(--tt-color-warning-bg)]'
                            : 'bg-[var(--tt-color-negative)]'
                        : 'bg-[var(--tt-color-surface-hover)]'
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs">
                {passwordStrength.strength === 5
                  ? '強'
                  : passwordStrength.strength >= 3
                    ? '中'
                    : '弱'}
              </div>
            </div>

            {/* 要件チェックリスト */}
            <div className="space-y-1 text-xs">
              <div
                className={`flex items-center gap-1 ${passwordStrength.requirements.minLength ? 'text-[var(--tt-color-positive)]' : 'text-[var(--tt-color-text-muted)]'}`}
              >
                {passwordStrength.requirements.minLength ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                8文字以上
              </div>
              <div
                className={`flex items-center gap-1 ${passwordStrength.requirements.hasUpperCase ? 'text-[var(--tt-color-positive)]' : 'text-[var(--tt-color-text-muted)]'}`}
              >
                {passwordStrength.requirements.hasUpperCase ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                大文字を含む (A-Z)
              </div>
              <div
                className={`flex items-center gap-1 ${passwordStrength.requirements.hasLowerCase ? 'text-[var(--tt-color-positive)]' : 'text-[var(--tt-color-text-muted)]'}`}
              >
                {passwordStrength.requirements.hasLowerCase ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                小文字を含む (a-z)
              </div>
              <div
                className={`flex items-center gap-1 ${passwordStrength.requirements.hasNumber ? 'text-[var(--tt-color-positive)]' : 'text-[var(--tt-color-text-muted)]'}`}
              >
                {passwordStrength.requirements.hasNumber ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                数字を含む (0-9)
              </div>
              <div
                className={`flex items-center gap-1 ${passwordStrength.requirements.hasSpecial ? 'text-[var(--tt-color-positive)]' : 'text-[var(--tt-color-text-muted)]'}`}
              >
                {passwordStrength.requirements.hasSpecial ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                記号を含む (!@#$%^&*等)
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">パスワード（確認）</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="パスワードを再入力"
            {...register('confirmPassword', {
              required: 'パスワードを再入力してください',
              validate: (value) =>
                value === password || 'パスワードが一致しません',
            })}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--tt-color-text-muted)] hover:text-[var(--tt-color-text)]"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-destructive text-sm">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="text-muted-foreground text-sm">
        アカウント作成後、確認メールをお送りします。メール内のリンクをクリックして登録を完了してください。
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
            アカウント作成
          </>
        )}
      </Button>
    </form>
  );
}
