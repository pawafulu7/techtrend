import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

const errors: Record<string, string> = {
  Configuration: 'サーバー設定にエラーがあります。',
  AccessDenied: 'このリソースへのアクセスが拒否されました。',
  Verification: '認証トークンの有効期限が切れています。',
  OAuthSignin: 'OAuth認証の開始時にエラーが発生しました。',
  OAuthCallback: 'OAuth認証の処理中にエラーが発生しました。',
  OAuthCreateAccount: 'OAuthアカウントの作成に失敗しました。',
  EmailCreateAccount: 'メールアカウントの作成に失敗しました。',
  Callback: 'コールバック処理中にエラーが発生しました。',
  OAuthAccountNotLinked:
    'このメールアドレスは既に別の認証方法で登録されています。',
  EmailSignin: 'メール認証の送信に失敗しました。',
  CredentialsSignin: 'メールアドレスまたはパスワードが正しくありません。',
  SessionRequired: 'このページにアクセスするにはログインが必要です。',
  Default: '認証中にエラーが発生しました。',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const errorMessage = errorCode
    ? errors[errorCode] || errors.Default
    : errors.Default;

  return (
    <div className="container mx-auto max-w-lg py-10">
      <Card>
        <CardHeader className="space-y-1">
          <div className="mb-4 flex items-center justify-center">
            <AlertCircle className="text-destructive h-12 w-12" />
          </div>
          <CardTitle className="text-center text-2xl">認証エラー</CardTitle>
          <CardDescription className="text-center">
            {errorMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-muted-foreground text-center text-sm">
            問題が解決しない場合は、時間をおいて再度お試しください。
            継続して問題が発生する場合は、サポートまでお問い合わせください。
          </div>
        </CardContent>
        <CardFooter className="flex justify-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/">ホームに戻る</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/login">ログインページへ</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
