/**
 * パーソナライズ設定の既定値・設定 API の応答の変換・期間の正規化。
 *
 * クライアントのフック（lib/hooks/use-personalization-preferences.ts）と、ホームの
 * サーバー描画（app/components/home/prefetch-home-articles.ts）の両方が使う。フックのファイルは
 * 'use client' なので、サーバーから値として読めるようにここへ分けている（issue #714）。
 */

import type { PeriodPreset, UserCategoryPreferences } from './types';

export const DEFAULT_PREFERENCES: UserCategoryPreferences = {
  selectedCategories: [],
  filterEnabled: false,
  periodMonths: 12,
  isAuthenticated: false,
};

/** 設定 API（GET /api/user/preferences/categories）の成功応答を、クエリに置く形にする */
export function fromPreferencesResponse(
  data: Partial<UserCategoryPreferences> | null
): UserCategoryPreferences {
  return { ...DEFAULT_PREFERENCES, ...data, isAuthenticated: true };
}

const VALID_PERIOD_PRESETS: readonly PeriodPreset[] = [0, 3, 6, 12];

/** 画面の選択肢（0・3・6・12 か月）に無い値は 12 か月として扱う */
export function normalizePeriodMonths(
  raw: number | undefined | null
): PeriodPreset {
  const value = raw ?? 12;
  return VALID_PERIOD_PRESETS.includes(value as PeriodPreset)
    ? (value as PeriodPreset)
    : 12;
}

/** ホームの記事一覧の条件に効くパーソナライズ設定 */
export interface HomePersonalization {
  filterEnabled: boolean;
  selectedCategories: string[];
  periodMonths: number;
}

export function toHomePersonalization(
  preferences: UserCategoryPreferences | undefined
): HomePersonalization {
  const resolved = preferences ?? DEFAULT_PREFERENCES;
  return {
    filterEnabled: resolved.filterEnabled ?? false,
    selectedCategories: resolved.selectedCategories ?? [],
    periodMonths: normalizePeriodMonths(resolved.periodMonths),
  };
}
