/**
 * 旧お気に入りソースを、ログイン中にどの画面でも裏でプリセットへ移す（Issue #709）
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { migrateLegacyFavoriteSources } from '@/lib/favorites/legacy-favorite-sources';
import { LegacyFavoriteSourcesAutoMigration } from '@/app/components/favorites/legacy-favorite-sources-auto-migration';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: { useSession: jest.fn() },
}));

jest.mock('@/lib/favorites/legacy-favorite-sources', () => ({
  ...jest.requireActual('@/lib/favorites/legacy-favorite-sources'),
  migrateLegacyFavoriteSources: jest.fn(),
}));

const mockMigrate = migrateLegacyFavoriteSources as jest.Mock;
const mockUseSession = authClient.useSession as jest.Mock;

function renderMigration() {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <LegacyFavoriteSourcesAutoMigration />
    </QueryClientProvider>
  );
  return { invalidate };
}

describe('LegacyFavoriteSourcesAutoMigration', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMigrate.mockReset().mockResolvedValue({
      status: 'migrated',
      sourceIds: ['src-a'],
    });
    (usePathname as jest.Mock).mockReturnValue('/');
    mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } } });
  });

  it('ログイン中で旧データがあれば移し、プリセットを取り直す', async () => {
    localStorage.setItem(
      'techtrend-favorite-sources',
      JSON.stringify([{ sourceId: 'src-a' }])
    );
    const { invalidate } = renderMigration();

    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['source-presets'] })
    );
  });

  it('旧データが無ければ何もしない', () => {
    renderMigration();

    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('ログインしていなければ移さない（プリセットはログインが要る）', () => {
    localStorage.setItem('techtrend-favorite-sources', '[]');
    mockUseSession.mockReturnValue({ data: null });
    renderMigration();

    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('旧 URL（/favorites/feed）では、そのページの移行に任せる', () => {
    localStorage.setItem('techtrend-favorite-sources', '[]');
    (usePathname as jest.Mock).mockReturnValue('/favorites/feed');
    renderMigration();

    expect(mockMigrate).not.toHaveBeenCalled();
  });
});
