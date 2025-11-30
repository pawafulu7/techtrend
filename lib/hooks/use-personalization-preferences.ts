/**
 * Personalization Preferences Hook
 *
 * React Query hook for managing user category preferences.
 * Handles fetching and updating personalization settings via API.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UserCategoryPreferences,
  UpdateCategoryPreferencesRequest,
  InterestCategoryWithCount,
  PeriodPreset,
} from '@/lib/personalization/types';

const EMPTY_CATEGORIES: InterestCategoryWithCount[] = [];
const EMPTY_SELECTED_CATEGORIES: string[] = [];
const DEFAULT_PREFERENCES: UserCategoryPreferences = {
  selectedCategories: [],
  filterEnabled: false,
  periodMonths: 12,
  isAuthenticated: false,
};

// =============================================================================
// Query Keys
// =============================================================================

export const PERSONALIZATION_QUERY_KEYS = {
  preferences: ['personalization-preferences'] as const,
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
      console.info(`[personalization] preferences API unavailable (${response.status}) — using defaults`);
      return { ...DEFAULT_PREFERENCES, isAuthenticated: false };
    }

    const data = await response.json().catch(() => DEFAULT_PREFERENCES);
    return data ? { ...data, isAuthenticated: true } : { ...DEFAULT_PREFERENCES, isAuthenticated: true };
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
      console.info(`[personalization] category API unavailable (${response?.status ?? 'network'}) — falling back`);
      return EMPTY_CATEGORIES;
    }

    const data = await response.json().catch(() => ({ categories: EMPTY_CATEGORIES }));
    return Array.isArray(data?.categories) ? data.categories : EMPTY_CATEGORIES;
  } catch {
    // Network error - fall back silently without logging error object
    console.info('[personalization] category fetch failed — disabling personalization UI');
    return EMPTY_CATEGORIES;
  }
}

async function updatePreferences(
  request: UpdateCategoryPreferencesRequest
): Promise<{ success: boolean; selectedCategories: string[] }> {
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

  return responseBody || { success: true, selectedCategories: request.categoryIds ?? [] };
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
  return useQuery({
    queryKey: PERSONALIZATION_QUERY_KEYS.preferences,
    queryFn: fetchPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: false, // fail gracefully for guest users or temporary API issues
  });
}

/**
 * Hook for updating user's category preferences
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePreferences,
    onSuccess: (data, variables) => {
      const selectedCategories =
        data?.selectedCategories ?? variables.categoryIds ?? [];
      const nextPeriod = variables.periodMonths;

      // Optimistic update
      queryClient.setQueryData<UserCategoryPreferences>(
        PERSONALIZATION_QUERY_KEYS.preferences,
        (old) => ({
          ...old,
          selectedCategories,
          filterEnabled: selectedCategories.length > 0,
          periodMonths: nextPeriod !== undefined ? nextPeriod : (old?.periodMonths ?? 12),
          isAuthenticated: true,
        })
      );

      // Invalidate article queries to refresh with new personalization
      queryClient.invalidateQueries({
        queryKey: ['infinite-articles'],
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

  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const preferences = preferencesQuery.data ?? DEFAULT_PREFERENCES;
  const selectedCategories = preferences.selectedCategories ?? EMPTY_SELECTED_CATEGORIES;

  return {
    // Data
    categories,
    selectedCategories,
    filterEnabled: preferences.filterEnabled ?? false,
    periodMonths: (preferences.periodMonths ?? 12) as PeriodPreset,

    // Loading states
    isLoadingCategories: categoriesQuery.isLoading,
    isLoadingPreferences: preferencesQuery.isLoading,
    isLoading: categoriesQuery.isLoading || preferencesQuery.isLoading,

    // Error states
    categoriesError: categoriesQuery.error,
    preferencesError: preferencesQuery.error,

    // Mutation
    updatePreferences: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Helpers
    hasPreferences: selectedCategories.length > 0,
    isAuthenticated: preferencesQuery.data?.isAuthenticated === true,
  };
}
