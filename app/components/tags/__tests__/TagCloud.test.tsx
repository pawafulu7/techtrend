import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { TagCloud } from '@/app/components/tags/TagCloud';
import { useRouter } from 'next/navigation';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// fetchのモック
global.fetch = jest.fn();

const mockTags = [
  { id: '1', name: 'React', count: 100, trend: 'rising' },
  { id: '2', name: 'TypeScript', count: 80, trend: 'stable' },
  { id: '3', name: 'Next.js', count: 60, trend: 'falling' },
  { id: '4', name: 'Vue', count: 40, trend: 'stable' },
  { id: '5', name: 'Node.js', count: 20, trend: 'rising' },
];

// Custom render function with improved async handling
interface TagCloudTestProps {
  className?: string;
  limit?: number;
  period?: '7d' | '30d' | 'all';
  onTagClick?: (tag: string) => void;
}

const renderTagCloud = async (props?: TagCloudTestProps) => {
  const result = render(<TagCloud {...props} />);
  // Wait for initial loading to complete using waitFor
  await waitFor(() => {
    // Check that loading state has resolved
    expect(result.container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  }, { timeout: 1000 });
  return result;
};

describe('TagCloud', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ tags: mockTags }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('タグクラウドが正しく表示される', async () => {
      await renderTagCloud();
      
      // タイトル
      expect(screen.getByText('タグクラウド')).toBeInTheDocument();
      
      // 期間切り替えボタン
      expect(screen.getByRole('button', { name: '週間' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '月間' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '全期間' })).toBeInTheDocument();
      
      // タグが読み込まれる
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
        expect(screen.getByText('Next.js')).toBeInTheDocument();
        expect(screen.getByText('Vue')).toBeInTheDocument();
        expect(screen.getByText('Node.js')).toBeInTheDocument();
      });
    });

    it('初期状態でローディングが表示される', () => {
      // 初期状態を確認するため、actなしでレンダリング
      render(<TagCloud />);
      
      // Skeletonローディングが表示される（animate-pulseクラスを探す）
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('デフォルトで月間（30d）が選択されている', async () => {
      await renderTagCloud();
      
      const monthlyButton = screen.getByRole('button', { name: '月間' });
      expect(monthlyButton).toHaveClass('bg-primary'); // variant="default"のスタイル
    });
  });

  describe('API通信', () => {
    it('正しいパラメータでAPIを呼び出す', async () => {
      await renderTagCloud({ limit: 30 });
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=30d&limit=30');
      });
    });

    it('期間を変更するとAPIを再呼び出しする', async () => {
      const user = userEvent.setup();
      await renderTagCloud();
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=30d&limit=50');
      });
      
      // 週間に切り替え
      const weeklyButton = screen.getByRole('button', { name: '週間' });
      await user.click(weeklyButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=7d&limit=50');
      });
      
      // 全期間に切り替え
      const allButton = screen.getByRole('button', { name: '全期間' });
      await user.click(allButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=all&limit=50');
      });
    });

    it('リフレッシュボタンでデータを再取得する', async () => {
      const user = userEvent.setup();
      await renderTagCloud();
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      
      // リフレッシュボタンをクリック
      const refreshButton = screen.getByRole('button', { name: '' }); // RefreshCw icon
      await user.click(refreshButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('エラー処理', () => {
    it('APIエラー時にエラーメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });
      
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load tags')).toBeInTheDocument();
      });
      
      // 再試行ボタンが表示される
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('ネットワークエラー時にエラーメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('再試行ボタンでデータを再取得する', async () => {
      const user = userEvent.setup();
      
      // 最初はエラー
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      
      // 2回目は成功
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tags: mockTags }),
      });
      
      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);
      
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
      });
    });
  });

  describe('タグの表示', () => {
    it('タグ数が0の場合にメッセージを表示する', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tags: [] }),
      });
      
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('タグが見つかりませんでした')).toBeInTheDocument();
      });
    });

    it('タグのツールチップに件数が表示される', async () => {
      await renderTagCloud();
      
      await waitFor(() => {
        const reactTag = screen.getByText('React');
        expect(reactTag).toHaveAttribute('title', 'React (100件)');
      });
    });

    it('トレンドアイコンが表示される（全期間以外）', async () => {
      await renderTagCloud();
      
      await waitFor(() => {
        // Rising trend icon for React
        const reactTag = screen.getByText('React').parentElement;
        const risingIcon = reactTag?.querySelector('.lucide-trending-up');
        expect(risingIcon).toBeInTheDocument();
        
        // Falling trend icon for Next.js
        const nextTag = screen.getByText('Next.js').parentElement;
        const fallingIcon = nextTag?.querySelector('.lucide-trending-down');
        expect(fallingIcon).toBeInTheDocument();
      });
    });

    it('全期間選択時はトレンドアイコンが表示されない', async () => {
      const user = userEvent.setup();
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
      });
      
      // 全期間に切り替え
      const allButton = screen.getByRole('button', { name: '全期間' });
      await user.click(allButton);
      
      await waitFor(() => {
        const reactTag = screen.getByText('React').parentElement;
        const trendIcon = reactTag?.querySelector('.lucide-trending-up');
        expect(trendIcon).not.toBeInTheDocument();
      });
    });
  });

  describe('タグのスタイリング', () => {
    it('使用頻度に応じてフォントサイズが変わる', async () => {
      await renderTagCloud();
      
      await waitFor(() => {
        const reactTag = screen.getByText('React');
        const nodeTag = screen.getByText('Node.js');
        
        const reactFontSize = parseFloat(reactTag.style.fontSize);
        const nodeFontSize = parseFloat(nodeTag.style.fontSize);
        
        // Reactの方が使用頻度が高いので、フォントサイズが大きい
        expect(reactFontSize).toBeGreaterThan(nodeFontSize);
      });
    });

    it('トレンドに応じて色が変わる', async () => {
      await renderTagCloud();
      
      await waitFor(() => {
        const reactTag = screen.getByText('React');
        const nextTag = screen.getByText('Next.js');
        
        // Rising trend - green color
        expect(reactTag).toHaveClass('text-green-600');
        
        // Falling trend - red color
        expect(nextTag).toHaveClass('text-red-600');
      });
    });
  });

  describe('タグクリックイベント', () => {
    it('タグクリックでデフォルトのナビゲーションが実行される', async () => {
      const user = userEvent.setup();
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
      });
      
      const reactTag = screen.getByText('React');
      await user.click(reactTag);
      
      expect(mockRouter.push).toHaveBeenCalledWith('/search?tags=React');
    });

    it('カスタムonTagClickハンドラーが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleTagClick = jest.fn();
      
      await renderTagCloud({ onTagClick: handleTagClick });
      
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
      });
      
      const reactTag = screen.getByText('React');
      await user.click(reactTag);
      
      expect(handleTagClick).toHaveBeenCalledWith('React');
      expect(mockRouter.push).not.toHaveBeenCalled(); // デフォルトナビゲーションは実行されない
    });
  });

  describe('凡例', () => {
    it('トレンド凡例が表示される', async () => {
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
      });
      
      // 凡例テキスト
      expect(screen.getByText('急上昇')).toBeInTheDocument();
      expect(screen.getByText('安定')).toBeInTheDocument();
      expect(screen.getByText('下降')).toBeInTheDocument();
    });

    it('タグが0の場合は凡例が表示されない', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tags: [] }),
      });
      
      await renderTagCloud();
      
      await waitFor(() => {
        expect(screen.getByText('タグが見つかりませんでした')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('急上昇')).not.toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('リフレッシュ中はボタンがdisabledになる', async () => {
      // 初期状態を確認
      render(<TagCloud />);
      
      // 初期ローディング中
      const refreshButton = screen.getByRole('button', { name: '' }); // RefreshCw icon
      expect(refreshButton).toBeDisabled();
      
      // ローディング完了後
      await waitFor(() => {
        expect(refreshButton).not.toBeDisabled();
      });
    });

    it('リフレッシュ中はアイコンが回転する', async () => {
      // 初期状態を確認
      render(<TagCloud />);
      
      const refreshIcon = document.querySelector('.lucide-refresh-cw');
      expect(refreshIcon).toHaveClass('animate-spin');
      
      await waitFor(() => {
        expect(refreshIcon).not.toHaveClass('animate-spin');
      });
    });
  });

  describe('Props', () => {
    it('limitプロパティが適用される', async () => {
      await renderTagCloud({ limit: 10 });
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=30d&limit=10');
      });
    });

    it('初期periodプロパティが適用される', async () => {
      await renderTagCloud({ period: "7d" });
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tags/cloud?period=7d&limit=50');
      });
      
      // 週間ボタンがアクティブ
      const weeklyButton = screen.getByRole('button', { name: '週間' });
      expect(weeklyButton).toHaveClass('bg-primary');
    });

    it('classNameプロパティが適用される', async () => {
      const { container } = await renderTagCloud({ className: "custom-class" });
      
      const card = container.querySelector('.custom-class');
      expect(card).toBeInTheDocument();
    });
  });
});