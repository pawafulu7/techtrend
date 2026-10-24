'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';
import {
  LEGACY_FAVORITE_SOURCES_KEY,
  migrateLegacyFavoriteSources,
} from '@/lib/favorites/legacy-favorite-sources';
import { legacyFavoriteMigrationApi } from '@/lib/favorites/legacy-favorite-sources-api';

/** 旧 URL のページは、自分で移してからホームへ移る（同時に 2 つ走らせない） */
const LEGACY_FEED_PATH = '/favorites/feed';

/**
 * ブラウザに旧お気に入りソースが残っていれば、ログイン中にどの画面でも裏でプリセットへ移す（Issue #709）。
 *
 * 旧 /favorites/feed にはどこからもリンクが無かったので、そこを開いたときだけ移すと移らないまま残る。
 * 失敗したら何も出さず、旧データも消さない（次に画面を開いたときにやり直す）
 */
export function LegacyFavoriteSourcesAutoMigration() {
  const { data: session } = authClient.useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const startedRef = useRef(false);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || startedRef.current || pathname === LEGACY_FEED_PATH) return;
    let storage: Storage;
    try {
      storage = window.localStorage;
      if (storage.getItem(LEGACY_FAVORITE_SOURCES_KEY) === null) return;
    } catch {
      return;
    }
    startedRef.current = true;
    void migrateLegacyFavoriteSources({
      storage,
      api: legacyFavoriteMigrationApi,
    }).then((result) => {
      if (result.status === 'migrated') {
        void queryClient.invalidateQueries({ queryKey: ['source-presets'] });
      }
    });
  }, [userId, pathname, queryClient]);

  return null;
}
