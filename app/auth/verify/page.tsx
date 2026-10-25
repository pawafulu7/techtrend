'use client';

import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Mail } from 'lucide-react';
import Link from 'next/link';

type VerificationState = 'verified' | 'sent' | 'expired' | 'error';

// 確認メールのリンク（Better Auth の /api/auth/verify-email）からの戻り先は
// EMAIL_VERIFICATION_CALLBACK_URL（?success=true）。確認に失敗すると Better Auth は
// 同じ戻り先に `&error=<コード>` を付けて返すので、error を success より先に見る。
// 確認が済んでもログインはしない（lib/auth/auth.ts の autoSignInAfterVerification）。
function getVerificationState(
  searchParams: Pick<URLSearchParams, 'get'>
): VerificationState {
  const error = searchParams.get('error');
  if (error === 'TOKEN_EXPIRED') return 'expired';
  if (error) return 'error';
  if (searchParams.get('success') === 'true') return 'verified';
  return 'sent';
}

const TITLES: Record<VerificationState, string> = {
  verified: '確認完了！',
  sent: 'メールをご確認ください',
  expired: '期限切れ',
  error: 'エラー',
};

const MESSAGES: Record<VerificationState, string> = {
  verified: 'メールアドレスの確認が完了しました！',
  sent: '確認メールを送信しました。メール内のリンクを開いて、登録を完了してください。',
  expired: '認証リンクの有効期限が切れています。',
  error: '認証リンクが無効です。もう一度お試しください。',
};

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const verificationState = getVerificationState(searchParams);

  const getIcon = () => {
    switch (verificationState) {
      case 'verified':
        return (
          <CheckCircle className="h-12 w-12 text-[var(--tt-color-positive)]" />
        );
      case 'sent':
        return <Mail className="h-12 w-12 text-[var(--tt-color-info)]" />;
      case 'expired':
      case 'error':
        return (
          <XCircle className="h-12 w-12 text-[var(--tt-color-negative)]" />
        );
    }
  };

  return (
    <div className="container mx-auto max-w-lg py-10">
      <Card>
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">{getIcon()}</div>
          <h1 className="font-heading text-foreground text-h1">
            {TITLES[verificationState]}
          </h1>
          <CardDescription className="mt-2">
            {MESSAGES[verificationState]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verificationState === 'verified' && (
            <div className="space-y-4">
              <Alert className="border-[var(--tt-color-positive-border)] bg-[var(--tt-color-positive-bg)]">
                <CheckCircle className="h-4 w-4 text-[var(--tt-color-positive)]" />
                <AlertDescription className="text-[var(--tt-color-positive)]">
                  アカウントが有効化されました。ログインしてTechTrendをお楽しみください。
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link href="/auth/login">ログインページへ</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">ホームへ戻る</Link>
                </Button>
              </div>
            </div>
          )}

          {verificationState === 'sent' && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/">ホームへ戻る</Link>
            </Button>
          )}

          {verificationState === 'expired' && (
            <div className="space-y-4">
              <Alert className="border-[var(--tt-color-warning-border)] bg-[var(--tt-color-warning-bg)]">
                <AlertDescription className="text-[var(--tt-color-warning)]">
                  認証リンクの有効期限は24時間です。ログインすると、新しい確認メールを送信できます。
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link href="/auth/login">
                    <Mail className="mr-2 h-4 w-4" />
                    ログインして確認メールを再送信
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">ホームへ戻る</Link>
                </Button>
              </div>
            </div>
          )}

          {verificationState === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>
                  問題が発生しました。しばらく時間をおいてから再度お試しください。
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/signup">新規登録ページへ</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">ホームへ戻る</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
