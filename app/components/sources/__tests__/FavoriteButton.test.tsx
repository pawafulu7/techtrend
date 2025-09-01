import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { FavoriteButton } from '@/app/components/sources/FavoriteButton';
import { useFavoriteSources } from '@/lib/favorites/hooks';

// モック
jest.mock('@/lib/favorites/hooks', () => ({
  useFavoriteSources: jest.fn(),
}));

describe('FavoriteButton', () => {
  const mockToggleFavorite = jest.fn();
  const mockIsFavorite = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // デフォルトのモック実装
    (useFavoriteSources as jest.Mock).mockReturnValue({
      isFavorite: mockIsFavorite,
      toggleFavorite: mockToggleFavorite,
      favorites: [],
      folders: [],
      isLoading: false,
      addFavorite: jest.fn(),
      removeFavorite: jest.fn(),
      moveFavorite: jest.fn(),
      updateNotifications: jest.fn(),
      reorderFavorites: jest.fn(),
      createFolder: jest.fn(),
      updateFolder: jest.fn(),
      deleteFolder: jest.fn(),
      getFavoritesByFolder: jest.fn(),
      exportData: jest.fn(),
      importData: jest.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('お気に入りではない場合、outlineボタンが表示される', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-background'); // outline variant
      
      const star = button.querySelector('.lucide-star');
      expect(star).toBeInTheDocument();
      expect(star).not.toHaveClass('fill-current');
    });

    it('お気に入りの場合、defaultボタンが表示される', () => {
      mockIsFavorite.mockReturnValue(true);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary'); // default variant
      
      const star = button.querySelector('.lucide-star');
      expect(star).toHaveClass('fill-current');
    });

    it('showTextがtrueの場合、テキストが表示される', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" showText />);
      
      expect(screen.getByText('お気に入りに追加')).toBeInTheDocument();
    });

    it('お気に入りの場合、解除テキストが表示される', () => {
      mockIsFavorite.mockReturnValue(true);
      
      render(<FavoriteButton sourceId="source-1" showText />);
      
      expect(screen.getByText('お気に入り解除')).toBeInTheDocument();
    });
  });

  describe('クリックイベント', () => {
    it('クリック時にtoggleFavoriteが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(mockToggleFavorite).toHaveBeenCalledWith('source-1');
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });

    it('イベントの伝播を防ぐ', async () => {
      const user = userEvent.setup({ delay: null });
      const handleContainerClick = jest.fn();
      mockIsFavorite.mockReturnValue(false);
      
      render(
        <div onClick={handleContainerClick}>
          <FavoriteButton sourceId="source-1" />
        </div>
      );
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      // preventDefault と stopPropagation が呼ばれるため、親要素のクリックは発火しない
      expect(handleContainerClick).not.toHaveBeenCalled();
      expect(mockToggleFavorite).toHaveBeenCalled();
    });

    it('お気に入り状態が切り替わる', async () => {
      const user = userEvent.setup({ delay: null });
      const { rerender } = render(<FavoriteButton sourceId="source-1" />);
      
      // 初期状態（お気に入りではない）
      mockIsFavorite.mockReturnValue(false);
      rerender(<FavoriteButton sourceId="source-1" />);
      
      let button = screen.getByRole('button');
      expect(button).toHaveClass('bg-background');
      
      // クリック後（お気に入りに追加）
      mockIsFavorite.mockReturnValue(true);
      await user.click(button);
      rerender(<FavoriteButton sourceId="source-1" />);
      
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary');
    });
  });

  describe('アニメーション', () => {
    it('クリック時にアニメーションクラスが追加される', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      
      // クリック前はアニメーションクラスなし
      expect(button).not.toHaveClass('scale-110');
      
      // クリック
      await user.click(button);
      
      // アニメーションクラスが追加される
      expect(button).toHaveClass('scale-110');
    });

    it('300ms後にアニメーションクラスが削除される', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      // アニメーション中
      expect(button).toHaveClass('scale-110');
      
      // 300ms経過
      act(() => {
        jest.advanceTimersByTime(300);
      });
      
      await waitFor(() => {
        expect(button).not.toHaveClass('scale-110');
      });
    });

    it('複数回クリックしてもアニメーションが正しく動作する', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      
      // 1回目のクリック
      await user.click(button);
      expect(button).toHaveClass('scale-110');
      
      // アニメーション終了
      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => {
        expect(button).not.toHaveClass('scale-110');
      });
      
      // 2回目のクリック
      await user.click(button);
      expect(button).toHaveClass('scale-110');
      
      // アニメーション終了
      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => {
        expect(button).not.toHaveClass('scale-110');
      });
      
      expect(mockToggleFavorite).toHaveBeenCalledTimes(2);
    });
  });

  describe('プロパティ', () => {
    it('サイズプロパティが適用される', () => {
      mockIsFavorite.mockReturnValue(false);
      
      const { rerender } = render(<FavoriteButton sourceId="source-1" size="sm" />);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('h-8'); // sm size
      
      rerender(<FavoriteButton sourceId="source-1" size="default" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('h-9'); // default size
      
      rerender(<FavoriteButton sourceId="source-1" size="lg" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('h-10'); // lg size
    });

    it('カスタムクラス名が適用される', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" className="custom-class" />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('transition-all'); // デフォルトクラスも保持
    });

    it('showTextがtrueの場合、アイコンにマージンが追加される', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" showText />);
      
      const star = screen.getByRole('button').querySelector('.lucide-star');
      expect(star).toHaveClass('mr-2');
    });

    it('showTextがfalseの場合、アイコンにマージンがない', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" showText={false} />);
      
      const star = screen.getByRole('button').querySelector('.lucide-star');
      expect(star).not.toHaveClass('mr-2');
    });
  });

  describe('異なるソースIDでの動作', () => {
    it('異なるソースIDで正しく動作する', async () => {
      const user = userEvent.setup({ delay: null });
      
      mockIsFavorite.mockImplementation((sourceId: string) => {
        return sourceId === 'source-2';
      });
      
      const { rerender } = render(<FavoriteButton sourceId="source-1" />);
      
      // source-1はお気に入りではない
      let button = screen.getByRole('button');
      expect(button).toHaveClass('bg-background');
      
      // source-2はお気に入り
      rerender(<FavoriteButton sourceId="source-2" />);
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary');
      
      // source-1をクリック
      rerender(<FavoriteButton sourceId="source-1" />);
      button = screen.getByRole('button');
      await user.click(button);
      expect(mockToggleFavorite).toHaveBeenCalledWith('source-1');
      
      // source-2をクリック
      rerender(<FavoriteButton sourceId="source-2" />);
      button = screen.getByRole('button');
      await user.click(button);
      expect(mockToggleFavorite).toHaveBeenCalledWith('source-2');
    });
  });

  describe('フックのローディング状態', () => {
    it('ローディング中でもボタンが表示される', () => {
      (useFavoriteSources as jest.Mock).mockReturnValue({
        isFavorite: () => false,
        toggleFavorite: mockToggleFavorite,
        isLoading: true,
        favorites: [],
        folders: [],
      });
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('エッジケース', () => {
    it('空のソースIDでも動作する', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="" />);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(mockToggleFavorite).toHaveBeenCalledWith('');
    });

    it('特殊文字を含むソースIDでも動作する', async () => {
      const user = userEvent.setup({ delay: null });
      const specialSourceId = 'source-!@#$%^&*()_+{}[]|\\:";\'<>?,./';
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId={specialSourceId} />);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(mockToggleFavorite).toHaveBeenCalledWith(specialSourceId);
    });

    it('高速連打しても正しく動作する', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      
      // 高速で5回クリック
      await user.click(button);
      await user.click(button);
      await user.click(button);
      await user.click(button);
      await user.click(button);
      
      // 全てのクリックが処理される
      expect(mockToggleFavorite).toHaveBeenCalledTimes(5);
      
      // アニメーションタイマーを進める
      act(() => {
        jest.advanceTimersByTime(300);
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なボタンロールを持つ', () => {
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('キーボード操作に対応する', async () => {
      const user = userEvent.setup({ delay: null });
      mockIsFavorite.mockReturnValue(false);
      
      render(<FavoriteButton sourceId="source-1" />);
      
      const button = screen.getByRole('button');
      
      // Tabでフォーカス
      await user.tab();
      expect(button).toHaveFocus();
      
      // Enterキーで実行
      await user.keyboard('{Enter}');
      expect(mockToggleFavorite).toHaveBeenCalledWith('source-1');
      
      // Spaceキーでも実行
      await user.keyboard(' ');
      expect(mockToggleFavorite).toHaveBeenCalledTimes(2);
    });

    it('視覚的フィードバックがある', () => {
      mockIsFavorite.mockReturnValue(false);
      
      const { rerender } = render(<FavoriteButton sourceId="source-1" />);
      
      // お気に入りでない時
      let star = screen.getByRole('button').querySelector('.lucide-star');
      expect(star).not.toHaveClass('fill-current');
      
      // お気に入りの時
      mockIsFavorite.mockReturnValue(true);
      rerender(<FavoriteButton sourceId="source-1" />);
      
      star = screen.getByRole('button').querySelector('.lucide-star');
      expect(star).toHaveClass('fill-current');
    });
  });
});