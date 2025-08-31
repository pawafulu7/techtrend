'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import Link from 'next/link';

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [verificationState, setVerificationState] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (!token || !email) {
        setVerificationState('error');
        setMessage('認証リンクが無効です。もう一度お試しください。');
        return;
      }

      // In production, this would verify the token through an API endpoint
      // For now, we'll simulate the verification process
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // In real implementation, check token validity
        // For demo purposes, we'll randomly succeed or fail
        const isValid = Math.random() > 0.2; // 80% success rate for demo
        
        if (isValid) {
          setVerificationState('success');
          setMessage('メールアドレスの確認が完了しました！');
        } else {
          setVerificationState('expired');
          setMessage('認証リンクの有効期限が切れています。');
        }
      } catch (error) {
        setVerificationState('error');
        setMessage('認証処理中にエラーが発生しました。');
      }
    };

    verifyEmail();
  }, [searchParams]);

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
                  アカウントが有効化されました。ログインしてTechTrendをお楽しみください。
                </AlertDescription>
              </Alert>
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