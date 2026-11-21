'use client';

import { useMemo, useState } from 'react';
import { usePersonalizationPreferences } from '@/app/hooks/use-personalization-preferences';
import { useIsHydrated } from '@/app/hooks/use-is-hydrated';
import type { HomePersonalization } from '@/lib/personalization/preferences-state';

/**
 * 一覧の取得条件に使うパーソナライズ設定。サーバーが1ページ目を先読みしたとき（initialPersonalization が
 * ある）は、hydration が終わり、クライアントで設定の判定が一度済むまで、サーバーが使った設定を返す
 * （issue #714。ホームとリーダーで使う）。
 * - hydration 中はサーバー描画と同じ条件にする（設定の判定が hydration より先に済んでも、
 *   条件が変わると一覧が食い違うため）
 * - 判定が済んで同じ設定なら queryKey は変わらず、1ページ目を取り直さない
 * - 一度判定が済んだ後（ユーザーが変わった等）は、サーバーの設定に戻らない
 */
export function useInitialPersonalization(
  initialPersonalization: HomePersonalization | undefined
): { personalization: HomePersonalization; isLoadingPreferences: boolean } {
  const {
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoadingPreferences,
  } = usePersonalizationPreferences();

  const isHydrated = useIsHydrated();
  const [hasResolvedPreferences, setHasResolvedPreferences] = useState(false);
  if (isHydrated && !isLoadingPreferences && !hasResolvedPreferences) {
    // 同一コンポーネントに対するレンダー中の setState（React が許可する形）
    setHasResolvedPreferences(true);
  }
  const shouldUseServerPersonalization =
    initialPersonalization !== undefined && !hasResolvedPreferences;

  const personalization = useMemo<HomePersonalization>(
    () =>
      shouldUseServerPersonalization && initialPersonalization
        ? initialPersonalization
        : { filterEnabled, selectedCategories, periodMonths },
    [
      shouldUseServerPersonalization,
      initialPersonalization,
      filterEnabled,
      selectedCategories,
      periodMonths,
    ]
  );

  return { personalization, isLoadingPreferences };
}
