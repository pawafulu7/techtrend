import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [adminClient()],
  // タブ復帰ごとの /api/auth/get-session 再取得を無効化する。
  // 再取得中は useSession().isPending が true に戻り、それが
  // usePersonalizationPreferences 経由で記事クエリの enabled を
  // false→true に再遷移させ、読み込み済み全ページの再取得と
  // 記事一覧 DOM の破棄（スクロール位置喪失）を引き起こしていた。
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
