'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';

interface UserSourcePreset {
  id: string;
  userId: string;
  name: string;
  sourceIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface PresetsResponse {
  presets: UserSourcePreset[];
}

interface CreatePresetInput {
  name: string;
  sourceIds: string[];
}

interface UpdatePresetInput {
  id: string;
  name?: string;
  sourceIds?: string[];
  sortOrder?: number;
}

async function fetchPresets(): Promise<PresetsResponse> {
  const res = await fetch('/api/user/source-presets');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch presets');
  }
  return res.json();
}

async function createPresetApi(
  input: CreatePresetInput
): Promise<{ preset: UserSourcePreset }> {
  const res = await fetch('/api/user/source-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to create preset');
  }
  return res.json();
}

async function updatePresetApi(
  input: UpdatePresetInput
): Promise<{ preset: UserSourcePreset }> {
  const { id, ...data } = input;
  const res = await fetch(`/api/user/source-presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to update preset');
  }
  return res.json();
}

async function deletePresetApi(id: string): Promise<void> {
  const res = await fetch(`/api/user/source-presets/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to delete preset');
  }
}

export function useSourcePresets() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const queryKey = ['source-presets', userId] as const;

  const query = useQuery({
    queryKey,
    queryFn: fetchPresets,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createPresetApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePresetApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePresetApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    presets: query.data?.presets ?? [],
    isLoading: query.isLoading,
    isAuthenticated: !!userId,
    createPreset: createMutation.mutateAsync,
    updatePreset: updateMutation.mutateAsync,
    deletePreset: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
