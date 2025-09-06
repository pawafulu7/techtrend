'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Globe, Github, Mail } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

// プロバイダーラベル定数
const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'メールリンク',
  credentials: 'メール/パスワード'
};

// プロバイダーアイコンマップ
const PROVIDER_ICONS: Record<string, React.ReactElement> = {
  google: <Globe className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  credentials: <Mail className="h-4 w-4" />,
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { data: userProfile, loading: profileLoading, error: profileError } = useUserProfile({
    enabled: status === 'authenticated'
  });
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent('/profile')}`);
    }
  }, [status, router]);

  if (status === 'loading' || profileLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null; // リダイレクト中は何も表示しない
  }

  if (profileError) {
    // 401エラーの場合は自動リダイレクト
    if (profileError.message.includes('認証が必要')) {
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent('/profile')}`);
      return null;
    }
    
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <Alert variant="destructive">
          <AlertDescription>
            プロフィール情報の取得に失敗しました：{profileError.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 認証方法のラベルを取得
  const getAuthMethodLabel = (providers: string[] | undefined, hasPassword?: boolean) => {
    if (!providers || providers.length === 0) {
      return hasPassword ? PROVIDER_LABELS.credentials : 'なし';
    }
    
    const providerLabels = providers.map(p => PROVIDER_LABELS[p] || p);
    if (hasPassword && !providers.includes('credentials')) {
      providerLabels.push(PROVIDER_LABELS.credentials);
    }
    
    return providerLabels.join(', ');
  };

  // プロバイダーアイコンを取得
  const getProviderIcon = (provider: string) => {
    return PROVIDER_ICONS[provider] ?? <Mail className="h-4 w-4" />;
  };

  return (
    <div className="container max-w-4xl mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">プロフィール設定</h1>
        <p className="text-muted-foreground mt-2">
          アカウント情報とプロフィールを管理します
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">プロフィール</TabsTrigger>
          <TabsTrigger value="account">アカウント</TabsTrigger>
          <TabsTrigger value="privacy">プライバシー</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>プロフィール情報</CardTitle>
              <CardDescription>
                他のユーザーに表示される公開情報を設定します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>アカウント情報</CardTitle>
              <CardDescription>
                アカウントの基本情報を確認します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">メールアドレス</h3>
                <p className="text-sm text-muted-foreground">
                  {userProfile?.email || session?.user?.email}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-2">認証方法</h3>
                <p className="text-sm text-muted-foreground">
                  {getAuthMethodLabel(userProfile?.providers, userProfile?.hasPassword)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">アカウント作成日</h3>
                <p className="text-sm text-muted-foreground">
                  {userProfile?.createdAt
                    ? new Date(userProfile.createdAt).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      })
                    : '不明'}
                </p>
              </div>
            </CardContent>
          </Card>

          {userProfile ? (
            userProfile.hasPassword ? (
              <Card>
                <CardHeader>
                  <CardTitle>パスワード変更</CardTitle>
                  <CardDescription>
                    アカウントのパスワードを変更します
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PasswordChangeForm />
                </CardContent>
              </Card>
            ) : (
              <Alert>
                <Globe className="h-4 w-4" />
                <AlertDescription>
                  {getAuthMethodLabel(userProfile.providers, userProfile.hasPassword)}でログインしているため、パスワード変更は不要です。
                  認証は外部プロバイダーによって安全に管理されています。
                </AlertDescription>
              </Alert>
            )
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>連携アカウント</CardTitle>
              <CardDescription>
                外部サービスとの連携を管理します
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userProfile?.providers && userProfile.providers.length > 0 ? (
                <ul className="space-y-3" role="list">
                  {userProfile.providers.map((provider) => (
                    <li key={provider} className="flex items-center gap-3">
                      {getProviderIcon(provider)}
                      <span className="text-sm font-medium">{getAuthMethodLabel([provider])}</span>
                      <span className="text-sm text-muted-foreground">（連携済み）</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  連携されているアカウントはありません
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>プライバシー設定</CardTitle>
              <CardDescription>
                データの公開範囲とプライバシーを管理します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">プロフィールの公開</h3>
                <p className="text-sm text-muted-foreground">
                  プロフィール情報は現在非公開です
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">お気に入りの公開</h3>
                <p className="text-sm text-muted-foreground">
                  お気に入り記事は非公開です
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">閲覧履歴</h3>
                <p className="text-sm text-muted-foreground">
                  閲覧履歴は本人のみ閲覧可能です
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">危険な操作</CardTitle>
              <CardDescription>
                これらの操作は取り消すことができません
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                アカウントを削除すると、すべてのデータが完全に削除されます。
                この操作は取り消すことができません。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}