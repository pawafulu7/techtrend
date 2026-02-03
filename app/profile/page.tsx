'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, User, UserCog, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { useUserProfile } from '@/hooks/useUserProfile';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'メールリンク',
  credentials: 'メール/パスワード',
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const {
    data: userProfile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfile({
    enabled: status === 'authenticated',
  });
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(
        `/auth/login?callbackUrl=${encodeURIComponent('/profile')}`
      );
    }
  }, [status, router]);

  if (status === 'loading' || profileLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <div className="flex h-32 items-center justify-center">
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
      router.replace(
        `/auth/login?callbackUrl=${encodeURIComponent('/profile')}`
      );
      return null;
    }
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Alert variant="destructive">
          <AlertDescription>
            プロフィール情報の取得に失敗しました：{profileError.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getAuthMethodLabel = (
    providers: string[] | undefined,
    hasPassword?: boolean
  ) => {
    if (!providers || providers.length === 0) {
      return hasPassword ? PROVIDER_LABELS.credentials : 'なし';
    }
    const providerLabels = providers.map((p) => PROVIDER_LABELS[p] || p);
    if (hasPassword && !providers.includes('credentials')) {
      providerLabels.push(PROVIDER_LABELS.credentials);
    }
    return providerLabels.join(', ');
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        icon={UserCog}
        title="プロフィール設定"
        description="基本情報とアカウント設定を管理します"
        className="mb-6"
      />

      {/* 2-column layout: lg and above */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Profile form (2/3 width) */}
        <div className="lg:col-span-2">
          <Card className="border-0 bg-white/95 shadow-lg dark:bg-slate-900/95">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">
                プロフィール編集
              </CardTitle>
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
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-0 bg-white/95 p-3 shadow-lg dark:bg-slate-900/95">
            {/* Account Info Content */}
            <div className="grid gap-0 text-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 dark:border-slate-800">
                <User className="h-4 w-4 text-slate-500" />
                <span className="font-medium">アカウント情報</span>
              </div>
              <div className="border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="text-muted-foreground mb-0.5 block text-xs">
                  メール
                </span>
                <span className="text-xs font-medium break-all">
                  {userProfile?.email || session?.user?.email}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="text-muted-foreground">認証方法</span>
                <span className="font-medium">
                  {getAuthMethodLabel(
                    userProfile?.providers,
                    userProfile?.hasPassword
                  )}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="text-muted-foreground">登録日</span>
                <span className="font-medium">
                  {userProfile?.createdAt
                    ? new Date(userProfile.createdAt).toLocaleDateString(
                        'ja-JP'
                      )
                    : '-'}
                </span>
              </div>
              {/* Password change form if applicable */}
              {userProfile?.hasPassword && (
                <div className="border-b border-slate-100 py-1.5 dark:border-slate-800">
                  <p className="mb-2 font-medium">パスワード変更</p>
                  <PasswordChangeForm />
                </div>
              )}
              {/* Danger zone - collapsible */}
              <details className="group py-1.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  <span>危険な操作</span>
                  <span className="text-muted-foreground ml-auto text-xs group-open:hidden">
                    クリックで表示
                  </span>
                  <span className="text-muted-foreground ml-auto hidden text-xs group-open:inline">
                    クリックで閉じる
                  </span>
                </summary>
                <div className="mt-2">
                  <p className="text-muted-foreground mb-2 text-xs">
                    アカウント削除は取り消せません
                  </p>
                  <DeleteAccountDialog
                    hasPassword={userProfile?.hasPassword ?? false}
                  />
                </div>
              </details>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
