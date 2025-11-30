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
  const response = await fetch('/api/user/preferences/categories');

  if (response.status === 401) {
    // Not authenticated - return default preferences
    return {
      selectedCategories: [],
      filterEnabled: false,
      periodMonths: 12,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch preferences: ${response.status}`);
  }

  return response.json();
}

async function fetchCategories(): Promise<InterestCategoryWithCount[]> {
  const response = await fetch('/api/interest-categories');

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  const data = await response.json();
  return data.categories;
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save preferences');
  }

  return response.json();
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
          periodMonths: nextPeriod ?? old?.periodMonths ?? 12,
        })
      );

      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: PERSONALIZATION_QUERY_KEYS.preferences,
      });

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
  const selectedCategories =
    preferencesQuery.data?.selectedCategories ?? EMPTY_SELECTED_CATEGORIES;

  return {
    // Data
    categories,
    selectedCategories,
    filterEnabled: preferencesQuery.data?.filterEnabled ?? false,
    periodMonths: (preferencesQuery.data?.periodMonths ?? 12) as PeriodPreset,

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
    isAuthenticated: preferencesQuery.data !== undefined,
  };
}
