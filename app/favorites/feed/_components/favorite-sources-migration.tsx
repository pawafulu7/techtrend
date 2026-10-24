'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { migrateLegacyFavoriteSources } from '@/lib/favorites/legacy-favorite-sources';
import { legacyFavoriteMigrationApi } from '@/lib/favorites/legacy-favorite-sources-api';

type MigrationState = 'migrating' | 'limit' | 'error';

/**
 * 旧 /favorites/feed（お気に入りソースのフィード）の行き先（Issue #709）
 *
 * ブラウザに残っているお気に入りソースを「お気に入りソース」のプリセットに移し、
 * そのソースで絞ったホームへ移る。移すものが無ければホームへ移る。
 */
export function FavoriteSourcesMigration() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MigrationState>('migrating');
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setState('migrating');
    let storage: Storage;
    try {
      storage = window.localStorage;
    } catch {
      // Storage を使えない（サイトのデータを止めている等）。移すものを読めない
      setState('error');
      return;
    }
    const result = await migrateLegacyFavoriteSources({
      storage,
      api: legacyFavoriteMigrationApi,
    });
    if (result.status === 'failed') {
      setState(result.reason);
      return;
    }
    if (result.status === 'none') {
      router.replace('/');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['source-presets'] });
    router.replace(
      result.sourceIds.length > 0
        ? `/?sources=${result.sourceIds.map(encodeURIComponent).join(',')}`
        : '/'
    );
  }, [queryClient, router]);

  useEffect(() => {
    // Strict Mode の二重実行で、プリセットを 2 回作りに行かない
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  if (state === 'migrating') {
    return (
      <div
        role="status"
        className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-(--tt-color-text-muted)"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        お気に入りソースをプリセットに移しています
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <ErrorState
        size="block"
        title="お気に入りソースをプリセットに移せませんでした"
        description={
          state === 'limit'
            ? 'カスタムプリセットは 10 件までです。ホームのフィルターで使っていないプリセットを消してから、もう一度試してください。お気に入りソースはこのブラウザに残っています。'
            : 'お気に入りソースはこのブラウザに残っています。もう一度試してください。'
        }
        onRetry={() => void run()}
      >
        <Button variant="outline" asChild className="mt-2">
          <Link href="/">ホームへ</Link>
        </Button>
      </ErrorState>
    </div>
  );
}
