'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, CheckCircle, Eye, EyeOff, Check, X } from 'lucide-react';

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
    const missing = [];
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
        
        {/* パスワード強度インジケーター */}
        {password && passwordStrength && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-1">
              <div className="text-xs text-gray-500">強度:</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 w-8 rounded ${
                      passwordStrength.strength >= level
                        ? passwordStrength.strength === 5
                          ? 'bg-green-500'
                          : passwordStrength.strength >= 3
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                        : 'bg-gray-200'
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
            <div className="text-xs space-y-1">
              <div className={`flex items-center gap-1 ${passwordStrength.requirements.minLength ? 'text-green-600' : 'text-gray-400'}`}>
                {passwordStrength.requirements.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                8文字以上
              </div>
              <div className={`flex items-center gap-1 ${passwordStrength.requirements.hasUpperCase ? 'text-green-600' : 'text-gray-400'}`}>
                {passwordStrength.requirements.hasUpperCase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                大文字を含む (A-Z)
              </div>
              <div className={`flex items-center gap-1 ${passwordStrength.requirements.hasLowerCase ? 'text-green-600' : 'text-gray-400'}`}>
                {passwordStrength.requirements.hasLowerCase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                小文字を含む (a-z)
              </div>
              <div className={`flex items-center gap-1 ${passwordStrength.requirements.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                {passwordStrength.requirements.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                数字を含む (0-9)
              </div>
              <div className={`flex items-center gap-1 ${passwordStrength.requirements.hasSpecial ? 'text-green-600' : 'text-gray-400'}`}>
                {passwordStrength.requirements.hasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
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