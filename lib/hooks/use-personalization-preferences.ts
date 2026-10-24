/**
 * Personalization Preferences Hook
 *
 * React Query hook for managing user category preferences.
 * Handles fetching and updating personalization settings via API.
 *
 * 分野の設定はホームとダイジェストで共通（Issue #709）。保存したら両方の一覧を取り直す。
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';
import { useIsSessionPendingLatched } from '@/lib/auth/use-session-resolved';
import type {
  UserCategoryPreferences,
  UpdateCategoryPreferencesRequest,
  InterestCategoryWithCount,
} from '@/lib/personalization/types';
import {
  DEFAULT_PREFERENCES,
  fromPreferencesResponse,
  normalizePeriodMonths,
} from '@/lib/personalization/preferences-state';

const EMPTY_CATEGORIES: InterestCategoryWithCount[] = [];
const EMPTY_SELECTED_CATEGORIES: string[] = [];

// =============================================================================
// Query Keys
// =============================================================================

export const PERSONALIZATION_QUERY_KEYS = {
  // userId をキーに含める: 含めないとセッション失効や同一 SPA 内でのユーザー
  // 切り替え後に、前のユーザーの設定がキャッシュから返ってしまう
  preferences: (userId?: string | null) =>
    ['personalization-preferences', userId ?? 'anonymous'] as const,
  categories: ['interest-categories'] as const,
};

// =============================================================================
// API Fetchers
// =============================================================================

async function fetchPreferences(): Promise<UserCategoryPreferences> {
  try {
    const response = await fetch('/api/user/preferences/categories');

    if (response.status === 401) {
      // Not authenticated - return default preferences silently
      return { ...DEFAULT_PREFERENCES, isAuthenticated: false };
    }

    if (!response.ok) {
      // API unavailable - fall back silently
      console.info(
        `[personalization] preferences API unavailable (${response.status}) — using defaults`
      );
      return { ...DEFAULT_PREFERENCES, isAuthenticated: false };
    }

    const data = await response.json().catch(() => null);
    return fromPreferencesResponse(data);
  } catch {
    // Network error - fall back silently without logging error object
    console.info('[personalization] preferences fetch failed — using defaults');
    return { ...DEFAULT_PREFERENCES, isAuthenticated: false };
  }
}

async function fetchCategories(): Promise<InterestCategoryWithCount[]> {
  try {
    const response = await fetch('/api/interest-categories');

    if (!response?.ok) {
      // API unavailable - fall back silently
      console.info(
        `[personalization] category API unavailable (${response?.status ?? 'network'}) — falling back`
      );
      return EMPTY_CATEGORIES;
    }

    const data = await response
      .json()
      .catch(() => ({ categories: EMPTY_CATEGORIES }));
    return Array.isArray(data?.categories) ? data.categories : EMPTY_CATEGORIES;
  } catch {
    // Network error - fall back silently without logging error object
    console.info(
      '[personalization] category fetch failed — disabling personalization UI'
    );
    return EMPTY_CATEGORIES;
  }
}

/** 保存の応答。保存した後の設定（サーバーが確定した値）を返す */
interface UpdatePreferencesResponse {
  success: boolean;
  selectedCategories: string[];
  filterEnabled?: boolean;
  periodMonths?: number;
}

async function updatePreferences(
  request: UpdateCategoryPreferencesRequest
): Promise<UpdatePreferencesResponse> {
  const response = await fetch('/api/user/preferences/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  let responseBody: any = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const errorMessage = responseBody?.error || 'Failed to save preferences';
    throw new Error(errorMessage);
  }

  return (
    responseBody || {
      success: true,
      selectedCategories: request.categoryIds ?? [],
    }
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook for fetching interest categories with article counts
 */
export function useInterestCategories() {
  return useQuery({
    queryKey: PERSONALIZATION_QUERY_KEYS.categories,
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: false, // avoid spamming console when the optional feature backend is unavailable
  });
}

/**
 * Hook for fetching user's category preferences
 */
export function useUserPreferences() {
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();

  return useQuery({
    queryKey: PERSONALIZATION_QUERY_KEYS.preferences(session?.user?.id),
    queryFn: fetchPreferences,
    // 未認証では 401 が確定しているため呼ばない（ゲストのホーム表示で毎回
    // /api/user/preferences/categories が 401 を返していた）。
    // セッション判定中も待ってから有効化する。
    // NOTE: React Query v5 の isLoading は `isPending && isFetching` なので、
    // enabled: false のとき isLoading は false になる。呼び出し側の
    // `enabled: !isLoadingPreferences`（home-client-infinite）は止まらない。
    enabled: !isSessionPending && !!session?.user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: false, // fail gracefully for guest users or temporary API issues
  });
}

/**
 * Hook for updating user's category preferences
 */
export function useUpdatePreferences() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateCategoryPreferencesRequest) =>
      updatePreferences(request),
    onSuccess: (data) => {
      const queryKey = PERSONALIZATION_QUERY_KEYS.preferences(
        session?.user?.id
      );
      // 応答の確定値でキャッシュを置き換える。ダイジェストから分野だけを保存したときも、ホームのスイッチと
      // 期間はサーバーの値になる（キャッシュが無いときに既定値で埋めると、ホームが誤った条件で一覧を取るため）。
      // 確定値が無い応答なら、設定を取り直す
      if (
        typeof data?.filterEnabled === 'boolean' &&
        typeof data?.periodMonths === 'number' &&
        Array.isArray(data?.selectedCategories)
      ) {
        queryClient.setQueryData<UserCategoryPreferences>(queryKey, {
          selectedCategories: data.selectedCategories,
          filterEnabled: data.filterEnabled,
          periodMonths: data.periodMonths,
          isAuthenticated: true,
        });
      } else {
        queryClient.invalidateQueries({ queryKey });
      }

      // ホームとダイジェストは同じ分野を読むので、両方を取り直す
      queryClient.invalidateQueries({
        queryKey: ['infinite-articles'],
      });
      queryClient.invalidateQueries({
        queryKey: ['digest'],
      });
    },
  });
}

/**
 * Combined hook for personalization preferences management
 */
export function usePersonalizationPreferences() {
  const categoriesQuery = useInterestCategories();
  const preferencesQuery = useUserPreferences();
  const updateMutation = useUpdatePreferences();

  // セッション判定中は preferences クエリが enabled: false のため isLoading が
  // false になる。そのまま公開すると認証済みユーザーで記事クエリが先に走り、
  // 直後に設定が解決して再フェッチ（＝空状態のフラッシュ、Issue #569 の再発）に
  // なるため、セッション判定中もローディング扱いにする。
  //
  // ただし better-auth のセッション取得は初回解決後にも isPending を true へ
  // 戻しうる（タブ復帰時の再検証など）。その揺れをそのまま公開すると記事クエリの
  // enabled が false→true に再遷移し、読み込み済み全ページの再取得と一覧 DOM の
  // 破棄（スクロール位置喪失）を招く。そこで isSessionPending の項だけ「一度
  // false になったら以降 false 固定」のラッチを掛ける。
  // preferencesQuery.isLoading はラッチしない: principal が変わったときは新しい
  // 設定の解決を待たなければ Issue #569 が別条件で再発するため。
  //
  // ラッチはモジュールスコープの共有状態（lib/auth/use-session-resolved.ts）。
  // フックインスタンス単位で持つと、記事詳細 → ホームのような再マウント経路で
  // 新インスタンスが「未解決」から始まりラッチが効かない。ラッチしているのは
  // isSessionPending の項だけで、これはセッション全体のグローバルな事実であり
  // このフック固有ではない（フック固有なのは preferencesQuery.isLoading の側）。
  const isSessionPendingLatched = useIsSessionPendingLatched();

  const isLoadingPreferences =
    isSessionPendingLatched || preferencesQuery.isLoading;

  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const preferences = preferencesQuery.data ?? DEFAULT_PREFERENCES;
  const selectedCategories =
    preferences.selectedCategories ?? EMPTY_SELECTED_CATEGORIES;

  // Validate periodMonths against allowed presets
  const periodMonths = normalizePeriodMonths(preferences.periodMonths);

  return {
    // Data
    categories,
    selectedCategories,
    filterEnabled: preferences.filterEnabled ?? false,
    periodMonths,

    // Loading states
    isLoadingCategories: categoriesQuery.isLoading,
    isLoadingPreferences,
    isLoading: categoriesQuery.isLoading || isLoadingPreferences,

    // Error states
    categoriesError: categoriesQuery.error,
    preferencesError: preferencesQuery.error,

    // Mutation
    updatePreferences: updateMutation.mutate,
    updatePreferencesAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Helpers
    hasPreferences: selectedCategories.length > 0,
    isAuthenticated: preferencesQuery.data?.isAuthenticated === true,
  };
}
