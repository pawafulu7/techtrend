'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, User, AlertTriangle } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'メールリンク',
  credentials: 'メール/パスワード'
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

        {/* Right column: Account info (1/3 width, sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
          <Card className="border-0 shadow-lg bg-white/95 dark:bg-slate-900/95 p-3">
            {/* Account Info Header */}
            <div className="flex items-center gap-2 mb-0">
              <User className="h-4 w-4 text-slate-500" />
              <span className="font-medium">アカウント情報</span>
            </div>

            {/* Account Info Content */}
            <div className="grid gap-0 text-sm">
              <div className="py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-muted-foreground block text-xs mb-0.5">メール</span>
                <span className="font-medium text-xs break-all">{userProfile?.email || session?.user?.email}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-muted-foreground">認証方法</span>
                <span className="font-medium">{getAuthMethodLabel(userProfile?.providers, userProfile?.hasPassword)}</span>
              </div>
              <div className="flex justify-between py-1.5">
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

            {/* Danger zone - collapsible */}
            <details className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 list-none">
                <AlertTriangle className="h-4 w-4" />
                <span>危険な操作</span>
                <span className="ml-auto text-xs text-muted-foreground group-open:hidden">クリックで表示</span>
                <span className="ml-auto text-xs text-muted-foreground hidden group-open:inline">クリックで閉じる</span>
              </summary>
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-3">
                  アカウント削除は取り消せません
                </p>
                <DeleteAccountDialog hasPassword={userProfile?.hasPassword ?? false} />
              </div>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
