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
      <div className="container max-w-2xl mx-auto py-6 px-4">
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
      <div className="container max-w-2xl mx-auto py-6 px-4">
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
    <div className="container max-w-2xl mx-auto py-6 px-4">
      <ProfileHeader
        userName={session?.user?.name}
        userEmail={session?.user?.email}
        userImage={session?.user?.image}
      />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-lg">
          <TabsTrigger
            value="profile"
            className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm text-sm"
          >
            プロフィール
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm text-sm"
          >
            アカウント
          </TabsTrigger>
          <TabsTrigger
            value="privacy"
            className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm text-sm"
          >
            プライバシー
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="border-0 shadow-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">プロフィール情報</CardTitle>
              <CardDescription className="text-xs">
                他のユーザーに表示される公開情報
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <Card className="border-0 shadow-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">アカウント情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-muted-foreground">メール</span>
                  <span className="font-medium">{userProfile?.email || session?.user?.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-muted-foreground">認証方法</span>
                  <span className="font-medium">{getAuthMethodLabel(userProfile?.providers, userProfile?.hasPassword)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">登録日</span>
                  <span className="font-medium">
                    {userProfile?.createdAt
                      ? new Date(userProfile.createdAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {userProfile?.hasPassword && (
            <Card className="border-0 shadow-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">パスワード変更</CardTitle>
              </CardHeader>
              <CardContent>
                <PasswordChangeForm />
              </CardContent>
            </Card>
          )}

          {userProfile && !userProfile.hasPassword && (
            <Alert className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <Globe className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {getAuthMethodLabel(userProfile.providers)}でログイン中
              </AlertDescription>
            </Alert>
          )}

          {userProfile?.providers && userProfile.providers.length > 0 && (
            <Card className="border-0 shadow-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">連携アカウント</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {userProfile.providers.map((provider) => (
                    <li key={provider} className="flex items-center gap-2 text-sm">
                      {getProviderIcon(provider)}
                      <span>{getAuthMethodLabel([provider])}</span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">連携済</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="privacy" className="mt-4 space-y-4">
          <Card className="border-0 shadow-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">プライバシー設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span>プロフィール</span>
                  <span className="text-muted-foreground">非公開</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span>お気に入り</span>
                  <span className="text-muted-foreground">非公開</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>閲覧履歴</span>
                  <span className="text-muted-foreground">本人のみ</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-red-50/80 dark:bg-red-950/30 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-600 dark:text-red-400">危険な操作</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                アカウント削除は取り消せません
              </p>
              <DeleteAccountDialog hasPassword={userProfile?.hasPassword ?? false} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
