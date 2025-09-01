import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from '../favorite-button';
import { renderWithProviders } from '@/test/utils/render-with-providers';
import { createMockUser } from '@/test/utils/mock-factories';

// next-auth/reactのモック
jest.mock('next-auth/react');

// useToastのモック
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

describe('FavoriteButton', () => {
  const mockArticleId = 'test-article-123';
  const mockUser = createMockUser();
  
  beforeEach(() => {
    // fetchのモックをリセット
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  describe('未認証状態', () => {
    it('お気に入りボタンが表示される', () => {
      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );
      
      const button = screen.getByRole('button', { name: /お気に入り/i });
      expect(button).toBeInTheDocument();
    });

    it('クリックするとログインを促すトーストが表示される', async () => {
      const user = userEvent.setup();
      const { useToast } = require('@/hooks/use-toast');
      const mockToast = jest.fn();
      useToast.mockReturnValue({ toast: mockToast });

      renderWithProviders(
        <FavoriteButton articleId={mockArticleId} />
      );
      
      const button = screen.getByRole('button', { name: /お気に入り/i });
      await user.click(button);
      
      expect(mockToast).toHaveBeenCalledWith({
        title: 'ログインが必要です',
        description: 'お気に入り機能を使用するにはログインしてください',
        variant: 'default',
      });
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

      // お気に入り済みの場合、ハートアイコンが塗りつぶされる
      const button = screen.getByRole('button', { name: /お気に入り/i });
      expect(button).toHaveClass('text-red-500');
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

      const button = screen.getByRole('button', { name: /お気に入り/i });
      
      // お気に入りに追加
      await user.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/favorites/${mockArticleId}`,
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      expect(button).toHaveClass('text-red-500');
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

      const button = screen.getByRole('button', { name: /お気に入り/i });
      expect(button).toHaveClass('text-red-500');
      
      // お気に入りを解除
      await user.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/favorites/${mockArticleId}`,
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });

      expect(button).not.toHaveClass('text-red-500');
    });

    it('APIエラー時にエラートーストを表示する', async () => {
      const user = userEvent.setup();
      const { useToast } = require('@/hooks/use-toast');
      const mockToast = jest.fn();
      useToast.mockReturnValue({ toast: mockToast });
      
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

      const button = screen.getByRole('button', { name: /お気に入り/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'エラー',
          description: 'お気に入りの更新に失敗しました',
          variant: 'destructive',
        });
      });
    });
  });

  describe('カスタムスタイル', () => {
    it('カスタムクラス名を適用できる', () => {
      renderWithProviders(
        <FavoriteButton 
          articleId={mockArticleId} 
          className="custom-class" 
        />
      );
      
      const button = screen.getByRole('button', { name: /お気に入り/i });
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
      
      // 遅延レスポンスをシミュレート
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isFavorited: false }),
        })
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

      const button = screen.getByRole('button', { name: /お気に入り/i });
      await user.click(button);

      // ローディング中はボタンが無効化される
      expect(button).toBeDisabled();

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      }, { timeout: 200 });
    });
  });
});