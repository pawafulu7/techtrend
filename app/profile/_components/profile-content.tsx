'use client';

import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { User, UserCog, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui-v2/button-v2';
import { UserProfileFetchError, useUserProfile } from '@/hooks/useUserProfile';
import { loginWithCallback } from '@/lib/routes/auth';
import { CREDENTIAL_PROVIDER_ID } from '@/lib/auth/constants';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'メールリンク',
  [CREDENTIAL_PROVIDER_ID]: 'メール/パスワード',
};

function getAuthMethodLabel(
  providers: string[] | undefined,
  hasPassword?: boolean
): string {
  if (!providers || providers.length === 0) {
    return hasPassword ? PROVIDER_LABELS[CREDENTIAL_PROVIDER_ID] : 'なし';
  }
  const providerLabels = providers.map((p) => PROVIDER_LABELS[p] || 'その他');
  if (hasPassword) {
    providerLabels.push(PROVIDER_LABELS[CREDENTIAL_PROVIDER_ID]);
  }
  return Array.from(new Set(providerLabels)).join(', ');
}

export function ProfileContent() {
  const {
    data: userProfile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile({ enabled: true });

  // 失敗後の再試行中はスケルトンに戻さず、失敗表示（再試行中…）を残す
  if (profileLoading && !profileError) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <div className="bg-muted h-5 w-5 animate-pulse rounded" />
          <h1 className="sr-only">プロフィール設定</h1>
          <div className="bg-muted h-5 w-32 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CardV2 className="p-4 sm:p-6">
              <div className="space-y-4">
                <div className="bg-muted h-6 w-40 animate-pulse rounded" />
                <div className="bg-muted h-4 w-64 animate-pulse rounded" />
                <div className="space-y-3 pt-4">
                  <div className="bg-muted h-10 w-full animate-pulse rounded" />
                  <div className="bg-muted h-10 w-full animate-pulse rounded" />
                  <div className="bg-muted h-10 w-full animate-pulse rounded" />
                </div>
              </div>
            </CardV2>
          </div>
          <div>
            <CardV2 className="p-3">
              <div className="space-y-3">
                <div className="bg-muted h-5 w-28 animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
              </div>
            </CardV2>
          </div>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div>
        <header className="flex flex-wrap items-center gap-2 pb-3">
          <UserCog className="text-primary h-5 w-5" aria-hidden="true" />
          <h1 className="text-foreground text-lg font-semibold">
            プロフィール設定
          </h1>
        </header>
        {/* 生の error.message は出さない（issue #701） */}
        <CardV2>
          {profileError instanceof UserProfileFetchError &&
          profileError.status === 401 ? (
            <ErrorState
              size="block"
              title="ログインの有効期限が切れました"
              description="プロフィールを表示するには、もう一度ログインしてください。"
            >
              <Button asChild className="mt-6 min-h-[44px]">
                <Link href={loginWithCallback('/profile')}>ログインする</Link>
              </Button>
            </ErrorState>
          ) : (
            <ErrorState
              size="block"
              title="プロフィール情報を読み込めませんでした"
              description="時間をおいて再試行してください。"
              onRetry={refetchProfile}
              retrying={profileLoading}
            />
          )}
        </CardV2>
      </div>
    );
  }

  return (
    <div>
      <header className="flex flex-wrap items-center gap-2 pb-3">
        <UserCog className="text-primary h-5 w-5" aria-hidden="true" />
        <h1 className="text-foreground text-lg font-semibold">
          プロフィール設定
        </h1>
      </header>

      {/* 2-column layout: lg and above */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Profile form (2/3 width) */}
        <div className="lg:col-span-2">
          <CardV2 className="p-4 sm:p-6">
            <div className="pb-3">
              <h2 className="text-foreground text-lg font-semibold">
                プロフィール編集
              </h2>
              <p className="text-muted-foreground text-sm">
                他のユーザーに表示される公開情報
              </p>
            </div>
            <ProfileForm />
          </CardV2>
        </div>

        {/* Right column: Account info (1/3 width, sticky) */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <CardV2 className="p-3">
            {/* Account Info Content */}
            <div className="grid gap-0 text-sm">
              <div className="border-border flex items-center gap-2 border-b py-1.5">
                <User
                  className="text-muted-foreground h-4 w-4"
                  aria-hidden="true"
                />
                <span className="font-medium">アカウント情報</span>
              </div>
              <div className="border-border border-b py-1.5">
                <span className="text-muted-foreground mb-0.5 block text-xs">
                  メール
                </span>
                <span className="text-xs font-medium break-all">
                  {userProfile?.email}
                </span>
              </div>
              <div className="border-border flex justify-between border-b py-1.5">
                <span className="text-muted-foreground">認証方法</span>
                <span className="font-medium">
                  {getAuthMethodLabel(
                    userProfile?.providers,
                    userProfile?.hasPassword
                  )}
                </span>
              </div>
              <div className="border-border flex justify-between border-b py-1.5">
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
                <div className="border-border border-b py-1.5">
                  <p className="mb-2 font-medium">パスワード変更</p>
                  <PasswordChangeForm />
                </div>
              )}
              {/* Danger zone - collapsible */}
              <details className="group py-1.5">
                <summary className="text-destructive hover:text-destructive/80 flex cursor-pointer list-none items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
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
          </CardV2>
        </div>
      </div>
    </div>
  );
}
