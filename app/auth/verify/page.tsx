'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import Link from 'next/link';

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const [verificationState, setVerificationState] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');
  const [isAutoLogin, setIsAutoLogin] = useState(false);
  
  // 自動ログイン処理
  const performAutoLogin = async (email: string, loginToken: string) => {
    try {
      // まず一時トークンを検証
      const validateResponse = await fetch('/api/auth/auto-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, loginToken }),
      });

      if (validateResponse.ok) {
        // NextAuthのsignInを使用してログイン
        const result = await signIn('credentials', {
          email,
          loginToken, // パスワードの代わりに一時トークンを使用
          redirect: false, // 手動でリダイレクトを制御
        });

        if (result?.ok) {
          // 3秒後にホームへリダイレクト
          setTimeout(() => {
            router.push('/');
            router.refresh();
          }, 3000);
        } else {
          // Auto-login failed
        }
      } else {
        // Token validation failed
      }
    } catch (error) {
      // Auto-login error
    }
  };

  useEffect(() => {
    // URLパラメータから成功・エラー状態を判定
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const email = searchParams.get('email');
    const loginToken = searchParams.get('loginToken');

    if (success === 'true' && email && loginToken) {
      setVerificationState('success');
      setMessage('メールアドレスの確認が完了しました！');
      setIsAutoLogin(true);
      
      // 自動ログイン処理
      performAutoLogin(email, loginToken);
    } else if (success === 'true') {
      setVerificationState('success');
      setMessage('メールアドレスの確認が完了しました！');
    } else if (error === 'token_expired') {
      setVerificationState('expired');
      setMessage('認証リンクの有効期限が切れています。');
    } else if (error === 'invalid_token') {
      setVerificationState('error');
      setMessage('認証リンクが無効です。もう一度お試しください。');
    } else if (error === 'verification_failed') {
      setVerificationState('error');
      setMessage('認証処理中にエラーが発生しました。');
    } else {
      // パラメータがない場合は通常のメール送信完了メッセージ
      setVerificationState('success');
      setMessage('確認メールを送信しました。メールをご確認ください。');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 自動ログイン後のリダイレクト処理
  useEffect(() => {
    if (isAutoLogin && status === 'authenticated') {
      // 3秒後にホームへリダイレクト
      const timer = setTimeout(() => {
        router.push('/');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isAutoLogin, status, router]);

  const getIcon = () => {
    switch (verificationState) {
      case 'verifying':
        return <Loader2 className="h-12 w-12 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case 'expired':
      case 'error':
        return <XCircle className="h-12 w-12 text-red-500" />;
    }
  };

  const getTitle = () => {
    switch (verificationState) {
      case 'verifying':
        return 'メールアドレスを確認中...';
      case 'success':
        return '確認完了！';
      case 'expired':
        return '期限切れ';
      case 'error':
        return 'エラー';
    }
  };

  return (
    <div className="container max-w-lg mx-auto py-10">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getIcon()}
          </div>
          <CardTitle className="text-2xl">{getTitle()}</CardTitle>
          <CardDescription className="mt-2">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verificationState === 'success' && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {isAutoLogin && status === 'authenticated' 
                    ? '自動ログインしました。まもなくホームページへ移動します...'
                    : 'アカウントが有効化されました。ログインしてTechTrendをお楽しみください。'}
                </AlertDescription>
              </Alert>
              
              {isAutoLogin && status === 'authenticated' ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    リダイレクト中...
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/">
                      今すぐホームへ移動
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link href="/auth/login">
                      ログインページへ
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/">
                      ホームへ戻る
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {verificationState === 'expired' && (
            <div className="space-y-4">
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertDescription className="text-yellow-800">
                  認証リンクの有効期限は24時間です。新しい認証メールをリクエストしてください。
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={() => {
                  // TODO: Implement resend verification email
                  alert('再送信機能は実装予定です');
                }}>
                  <Mail className="mr-2 h-4 w-4" />
                  認証メールを再送信
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/signup">
                    新規登録ページへ
                  </Link>
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
                  <Link href="/auth/signup">
                    新規登録ページへ
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">
                    ホームへ戻る
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}