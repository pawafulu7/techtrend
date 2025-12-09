'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Globe, Github, Mail, User, Shield } from 'lucide-react';
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
      <div className="container max-w-4xl mx-auto py-6 px-4">
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
      <div className="container max-w-4xl mx-auto py-6 px-4">
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
    <div className="container max-w-4xl mx-auto py-6 px-4">
      <ProfileHeader
        userName={session?.user?.name}
        userEmail={session?.user?.email}
        userImage={session?.user?.image}
      />

      {/* 2-column layout: lg and above */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Profile form (2/3 width) */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg bg-white/95 dark:bg-slate-900/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">プロフィール編集</CardTitle>
              <CardDescription className="text-sm">
                他のユーザーに表示される公開情報
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </div>

        {/* Right column: Account & Privacy accordions (1/3 width, sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
          <Card className="border-0 shadow-lg bg-white/95 dark:bg-slate-900/95">
            <Accordion type="multiple" className="w-full">
              {/* Account Info Accordion */}
              <AccordionItem value="account" className="border-b-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">アカウント情報</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-muted-foreground">メール</span>
                      <span className="font-medium truncate ml-2 max-w-[140px]">{userProfile?.email || session?.user?.email}</span>
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

                  {/* Password change form if applicable */}
                  {userProfile?.hasPassword && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-medium mb-3">パスワード変更</p>
                      <PasswordChangeForm />
                    </div>
                  )}

                  {/* OAuth provider info */}
                  {userProfile && !userProfile.hasPassword && (
                    <Alert className="mt-4 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <Globe className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {getAuthMethodLabel(userProfile.providers)}でログイン中
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Linked accounts */}
                  {userProfile?.providers && userProfile.providers.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-medium mb-2">連携アカウント</p>
                      <ul className="space-y-2">
                        {userProfile.providers.map((provider) => (
                          <li key={provider} className="flex items-center gap-2 text-sm">
                            {getProviderIcon(provider)}
                            <span>{getAuthMethodLabel([provider])}</span>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">連携済</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Privacy Settings Accordion */}
              <AccordionItem value="privacy" className="border-b-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">プライバシー設定</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
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

                  {/* Danger zone */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">危険な操作</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      アカウント削除は取り消せません
                    </p>
                    <DeleteAccountDialog hasPassword={userProfile?.hasPassword ?? false} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        </div>
      </div>
    </div>
  );
}
