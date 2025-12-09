'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Globe, Github, Mail } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'メールリンク',
  credentials: 'メール/パスワード'
};

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
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (profileError) {
    if (profileError.message.includes('認証が必要')) {
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent('/profile')}`);
      return null;
    }
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertDescription>
            プロフィール情報の取得に失敗しました：{profileError.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

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

  const getProviderIcon = (provider: string) => {
    return PROVIDER_ICONS[provider] ?? <Mail className="h-4 w-4" />;
  };

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <ProfileHeader
        userName={session?.user?.name}
        userEmail={session?.user?.email}
        userImage={session?.user?.image}
        createdAt={userProfile?.createdAt}
      />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="profile" className="flex-1">プロフィール</TabsTrigger>
          <TabsTrigger value="account" className="flex-1">アカウント</TabsTrigger>
          <TabsTrigger value="privacy" className="flex-1">プライバシー</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">プロフィール情報</CardTitle>
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
            <CardHeader className="pb-4">
              <CardTitle className="text-base">アカウント情報</CardTitle>
              <CardDescription>
                アカウントの基本情報を確認します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium mb-1">メールアドレス</h3>
                  <p className="text-sm text-muted-foreground">
                    {userProfile?.email || session?.user?.email}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1">認証方法</h3>
                  <p className="text-sm text-muted-foreground">
                    {getAuthMethodLabel(userProfile?.providers, userProfile?.hasPassword)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <h3 className="text-sm font-medium mb-1">アカウント作成日</h3>
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
              </div>
            </CardContent>
          </Card>

          {userProfile?.hasPassword && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">パスワード変更</CardTitle>
                <CardDescription>
                  アカウントのパスワードを変更します
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PasswordChangeForm />
              </CardContent>
            </Card>
          )}

          {userProfile && !userProfile.hasPassword && (
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertDescription>
                {getAuthMethodLabel(userProfile.providers, userProfile.hasPassword)}でログインしているため、パスワード変更は不要です。
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">連携アカウント</CardTitle>
              <CardDescription>
                外部サービスとの連携を管理します
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userProfile?.providers && userProfile.providers.length > 0 ? (
                <ul className="space-y-2" role="list">
                  {userProfile.providers.map((provider) => (
                    <li key={provider} className="flex items-center gap-3">
                      {getProviderIcon(provider)}
                      <span className="text-sm">{getAuthMethodLabel([provider])}</span>
                      <span className="text-xs text-muted-foreground">（連携済み）</span>
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
            <CardHeader className="pb-4">
              <CardTitle className="text-base">プライバシー設定</CardTitle>
              <CardDescription>
                データの公開範囲とプライバシーを管理します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">プロフィールの公開</span>
                <span className="text-xs text-muted-foreground">非公開</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">お気に入りの公開</span>
                <span className="text-xs text-muted-foreground">非公開</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">閲覧履歴</span>
                <span className="text-xs text-muted-foreground">本人のみ</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-base text-destructive">危険な操作</CardTitle>
              <CardDescription>
                これらの操作は取り消すことができません
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                アカウントを削除すると、すべてのデータが完全に削除されます。
              </p>
              <DeleteAccountDialog hasPassword={userProfile?.hasPassword ?? false} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
