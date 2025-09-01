import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from '../favorite-button';
import { renderWithProviders } from '@/test/utils/render-with-providers';
import { createMockUser } from '@/test/utils/mock-factories';

// next-auth/reactのモック
jest.mock('next-auth/react');

// next/navigationのモック
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// useToastのモック
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe('FavoriteButton', () => {
  const mockArticleId = 'test-article-123';
  const mockUser = createMockUser();
  
  beforeEach(() => {
    // fetchのモックをリセット
    global.fetch = jest.fn();
    jest.clearAllMocks();
    mockToast.mockClear();
  });

  describe('未認証状態', () => {
    beforeEach(() => {
      const { useSession } = require('next-auth/react');
      useSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });
    });

    it('お気に入りボタンが表示される', () => {
      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('クリックするとログインを促すトーストが表示される', async () => {
      const user = userEvent.setup();
      const { useRouter } = require('next/navigation');
      const mockPush = jest.fn();
      useRouter.mockReturnValue({ push: mockPush });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(mockToast).toHaveBeenCalledWith({
        title: 'ログインが必要です',
        description: 'お気に入り機能を使用するにはログインしてください。',
        variant: 'default',
      });
      
      expect(mockPush).toHaveBeenCalled();
    });
  });

  describe('認証済み状態', () => {
    beforeEach(() => {
      // useSessionモックを認証済み状態に設定
      const { useSession } = require('next-auth/react');
      useSession.mockReturnValue({
        data: {
          user: mockUser,
        },
        status: 'authenticated',
      });
    });

    it('お気に入り状態を取得して表示する', async () => {
      // お気に入り状態取得APIのモック
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isFavorited: true }),
      });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/favorites/${mockArticleId}`);
      });

      // ボタンが表示されることを確認
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('お気に入りをトグルできる', async () => {
      const user = userEvent.setup();
      
      // 初期状態：お気に入りではない
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: false }),
        })
        // お気に入り追加のレスポンス
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: true }),
        });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/favorites/${mockArticleId}`);
      });

      const button = screen.getByRole('button');
      
      // お気に入りに追加
      await user.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/favorites',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ articleId: mockArticleId }),
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'お気に入りに追加しました',
        variant: 'default',
      });
    });

    it('お気に入り解除ができる', async () => {
      const user = userEvent.setup();
      
      // 初期状態：お気に入り済み
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: true }),
        })
        // お気に入り解除のレスポンス
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: false }),
        });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/favorites/${mockArticleId}`);
      });

      const button = screen.getByRole('button');
      
      // お気に入りを解除
      await user.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/favorites?articleId=${mockArticleId}`,
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'お気に入りから削除しました',
        variant: 'default',
      });
    });

    it('APIエラー時にエラートーストを表示する', async () => {
      const user = userEvent.setup();
      
      // 初期状態取得
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: false }),
        })
        // エラーレスポンス
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/favorites/${mockArticleId}`);
      });

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'エラーが発生しました',
          description: 'もう一度お試しください',
          variant: 'destructive',
        });
      });
    });
  });

  describe('カスタムスタイル', () => {
    it('カスタムクラス名を適用できる', () => {
      const { useSession } = require('next-auth/react');
      useSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      renderWithProviders(
        <FavoriteButton 
          articleId={mockArticleId} 
          className="custom-class" 
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('ローディング状態', () => {
    it('処理中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      const { useSession } = require('next-auth/react');
      useSession.mockReturnValue({
        data: { user: mockUser },
        status: 'authenticated',
      });
      
      // 初期状態の取得
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: false }),
        })
        // 遅延レスポンスをシミュレート
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => 
              resolve({
                ok: true,
                json: async () => ({ isFavorited: true }),
              }), 100
            )
          )
        );

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(`/api/favorites/${mockArticleId}`);
      });

      const button = screen.getByRole('button');
      await user.click(button);

      // ローディング中はボタンが無効化される
      expect(button).toBeDisabled();

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      }, { timeout: 200 });
    });
  });
});