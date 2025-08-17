'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    redirect('/auth/login?callbackUrl=/profile');
  }

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
              <CardTitle>アカウント設定</CardTitle>
              <CardDescription>
                メールアドレスとパスワードを管理します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">メールアドレス</h3>
                <p className="text-sm text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-2">認証方法</h3>
                <p className="text-sm text-muted-foreground">
                  メール/パスワード認証
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">アカウント作成日</h3>
                <p className="text-sm text-muted-foreground">
                  {session?.user?.createdAt 
                    ? new Date(session.user.createdAt).toLocaleDateString('ja-JP')
                    : '不明'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>連携アカウント</CardTitle>
              <CardDescription>
                外部サービスとの連携を管理します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                連携されているアカウントはありません
              </p>
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