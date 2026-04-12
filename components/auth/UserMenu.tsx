'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui-v2/button-v2';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User,
  Heart,
  History,
  LogOut,
  Loader2,
  BarChart3,
  Cog,
  MessageSquare,
  Shield,
  Database,
  LineChart,
} from 'lucide-react';

export function UserMenu() {
  const { data: session, status } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: '/' });
    } catch (_error) {
    } finally {
      setIsSigningOut(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" asChild>
          <Link href="/auth/login">ログイン</Link>
        </Button>
        <Button asChild>
          <Link href="/auth/signup">新規登録</Link>
        </Button>
      </div>
    );
  }

  const userInitial =
    session.user?.name?.charAt(0)?.toUpperCase() ||
    session.user?.email?.charAt(0)?.toUpperCase() ||
    'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-10 rounded-full"
          data-testid="user-menu-trigger"
          aria-label="ユーザーメニュー"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={session.user?.image || ''}
              alt={session.user?.name || 'User'}
            />
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium">
              {session.user?.name || 'ユーザー'}
            </p>
            <p className="text-muted-foreground text-xs leading-none">
              {session.user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            プロフィール
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/favorites" className="cursor-pointer">
            <Heart className="mr-2 h-4 w-4" />
            お気に入り
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/history" className="cursor-pointer">
            <History className="mr-2 h-4 w-4" />
            閲覧履歴
          </Link>
        </DropdownMenuItem>
        {(session.user as any)?.role === 'admin' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              管理者メニュー
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/admin" prefetch={false} className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" />
                管理ダッシュボード
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/dashboard/performance"
                prefetch={false}
                className="cursor-pointer"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                パフォーマンス
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/dashboard/jobs"
                prefetch={false}
                className="cursor-pointer"
              >
                <Cog className="mr-2 h-4 w-4" />
                ジョブ管理
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/dashboard/social-posts"
                prefetch={false}
                className="cursor-pointer"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                SNS投稿管理
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/sources" prefetch={false} className="cursor-pointer">
                <Database className="mr-2 h-4 w-4" />
                ソース
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/stats" prefetch={false} className="cursor-pointer">
                <LineChart className="mr-2 h-4 w-4" />
                統計
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="cursor-pointer"
        >
          {isSigningOut ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ログアウト中...
            </>
          ) : (
            <>
              <LogOut className="mr-2 h-4 w-4" />
              ログアウト
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
