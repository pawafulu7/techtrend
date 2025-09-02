import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchBar } from '@/app/components/search/SearchBar';
import { useRouter, useSearchParams } from 'next/navigation';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// useDebounceフックのモック
jest.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

describe('SearchBar', () => {
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSearchParams as jest.Mock).mockImplementation(() => new URLSearchParams());
    
    // localStorageのモック (jest.spyOn使用)
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('検索バーが正しく表示される', () => {
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      expect(input).toBeInTheDocument();
      
      const searchButton = screen.getByRole('button', { name: '検索' });
      expect(searchButton).toBeInTheDocument();
    });

    it('初期状態で検索ボタンが無効化されている', () => {
      render(<SearchBar />);
      
      const searchButton = screen.getByRole('button', { name: '検索' });
      expect(searchButton).toBeDisabled();
    });

    it('URLパラメータから初期値を設定する', () => {
      const params = new URLSearchParams('q=React');
      (useSearchParams as jest.Mock).mockReturnValue(params);
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/) as HTMLInputElement;
      expect(input.value).toBe('React');
    });
  });

  describe('検索機能', () => {
    it('検索クエリを入力して検索を実行する', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      const searchButton = screen.getByRole('button', { name: '検索' });
      
      await user.type(input, 'TypeScript');
      expect(searchButton).not.toBeDisabled();
      
      await user.click(searchButton);
      
      expect(mockRouter.push).toHaveBeenCalledWith('/?search=TypeScript&page=1');
    });

    it('Enterキーで検索を実行する', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      
      await user.type(input, 'JavaScript{Enter}');
      
      expect(mockRouter.push).toHaveBeenCalledWith('/?search=JavaScript&page=1');
    });

    it('空の検索クエリでは検索を実行しない', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      
      await user.type(input, '   '); // 空白のみ
      
      const searchButton = screen.getByRole('button', { name: '検索' });
      expect(searchButton).toBeDisabled();
      
      await user.keyboard('{Enter}');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('検索履歴機能', () => {
    it('検索実行時に履歴を保存する', async () => {
      const user = userEvent.setup();
      (Storage.prototype.getItem as jest.Mock).mockReturnValue('[]');
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.type(input, 'Vue.js{Enter}');
      
      expect(Storage.prototype.setItem).toHaveBeenCalledWith(
        'searchHistory',
        JSON.stringify(['Vue.js'])
      );
    });

    it('検索履歴をサジェスチョンとして表示する', async () => {
      const user = userEvent.setup();
      const history = ['React', 'TypeScript', 'Next.js'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input); // フォーカス
      
      // 履歴が表示される
      await waitFor(() => {
        expect(screen.getByText('React')).toBeInTheDocument();
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
        expect(screen.getByText('Next.js')).toBeInTheDocument();
      });
    });

    it('検索履歴をクリアできる', async () => {
      const user = userEvent.setup();
      const history = ['React'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input);
      
      const clearButton = await screen.findByRole('button', { name: '検索履歴をクリア' });
      await user.click(clearButton);
      
      expect(Storage.prototype.removeItem).toHaveBeenCalledWith('searchHistory');
    });

    it('履歴から検索を実行できる', async () => {
      const user = userEvent.setup();
      const history = ['React', 'TypeScript'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input);
      
      const historyItem = await screen.findByText('React');
      await user.click(historyItem);
      
      expect(mockRouter.push).toHaveBeenCalledWith('/?search=React&page=1');
    });
  });

  describe('クリア機能', () => {
    it('検索クエリをクリアできる', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/) as HTMLInputElement;
      await user.type(input, 'Test Query');
      
      // クリアボタンが表示される
      const clearButton = await screen.findByRole('button', { name: 'クリア' });
      await user.click(clearButton);
      
      expect(input.value).toBe('');
      expect(mockRouter.push).toHaveBeenCalledWith('/?');
    });

    it('Escapeキーでサジェスチョンを閉じる', async () => {
      const user = userEvent.setup();
      const history = ['React'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input);
      
      // サジェスチョンが表示される
      expect(await screen.findByText('React')).toBeInTheDocument();
      
      await user.keyboard('{Escape}');
      
      // サジェスチョンが非表示になる
      await waitFor(() => {
        expect(screen.queryByText('React')).not.toBeInTheDocument();
      });
    });
  });

  describe('キーボードショートカット', () => {
    it('Cmd+K (Mac) でフォーカスする', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      const input = screen.getByPlaceholderText(/記事を検索/);
      
      await user.keyboard('{Meta>}k{/Meta}');
      await waitFor(() => expect(document.activeElement).toBe(input));
    });

    it('Ctrl+K (Windows/Linux) でフォーカスする', async () => {
      const user = userEvent.setup();
      render(<SearchBar />);
      const input = screen.getByPlaceholderText(/記事を検索/);
      
      await user.keyboard('{Control>}k{/Control}');
      await waitFor(() => expect(document.activeElement).toBe(input));
    });
  });

  describe('サジェスチョンの表示制御', () => {
    it('外部クリックでサジェスチョンを閉じる', async () => {
      const user = userEvent.setup();
      const history = ['React'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(
        <div>
          <SearchBar />
          <button>Outside Button</button>
        </div>
      );
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input);
      
      // サジェスチョンが表示される
      expect(await screen.findByText('React')).toBeInTheDocument();
      
      // 外部要素をクリック
      const outsideButton = screen.getByText('Outside Button');
      await user.click(outsideButton);
      
      // サジェスチョンが非表示になる
      await waitFor(() => {
        expect(screen.queryByText('React')).not.toBeInTheDocument();
      });
    });

    it('検索クエリに基づいてサジェスチョンをフィルタリングする', async () => {
      const user = userEvent.setup();
      const history = ['React', 'TypeScript', 'JavaScript'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.type(input, 'Script');
      
      // フィルタリングされたサジェスチョンが表示される
      await waitFor(() => {
        expect(screen.queryByText('React')).not.toBeInTheDocument();
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
        expect(screen.getByText('JavaScript')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('検索実行中にローディング状態を表示する', async () => {
      const user = userEvent.setup({ delay: null }); // fake timersと互換性のため
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.type(input, 'Test');
      
      const searchButton = screen.getByRole('button', { name: '検索' });
      await user.click(searchButton);
      
      // ローディングアイコンが一時的に表示される
      const loadingIcon = document.querySelector('.animate-spin');
      expect(loadingIcon).toBeInTheDocument();
      
      // fake timersで500ms超過まで進める（境界値問題回避）
      await act(async () => {
        jest.advanceTimersByTime(501);
      });
      
      // スピナーが消えることを待つ
      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
      });
      
      // 検索ボタンが再び有効になることを確認
      expect(await screen.findByRole('button', { name: '検索' })).toBeEnabled();
    });
  });

  describe('エッジケース', () => {
    it('無効なJSON履歴を適切に処理する', async () => {
      const user = userEvent.setup();
      (Storage.prototype.getItem as jest.Mock).mockReturnValue('invalid json');
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.click(input);
      
      // エラーが発生せず、サジェスチョンが表示されない
      expect(screen.queryByText('履歴')).not.toBeInTheDocument();
    });

    it('履歴の最大件数（10件）を超えない', async () => {
      const user = userEvent.setup();
      const longHistory = Array.from({ length: 15 }, (_, i) => `Query ${i}`);
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(longHistory));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.type(input, 'New Query');
      
      await user.keyboard('{Enter}');
      
      // 新しい履歴が追加され、10件に制限される
      const savedHistory = JSON.parse(
        (Storage.prototype.setItem as jest.Mock).mock.calls[0][1]
      );
      expect(savedHistory).toHaveLength(10);
      expect(savedHistory[0]).toBe('New Query');
    });

    it('重複する履歴を削除する', async () => {
      const user = userEvent.setup();
      const history = ['React', 'TypeScript', 'JavaScript'];
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(history));
      
      render(<SearchBar />);
      
      const input = screen.getByPlaceholderText(/記事を検索/);
      await user.type(input, 'React'); // 既存の履歴と重複
      
      await user.keyboard('{Enter}');
      
      // 重複が削除され、最新が先頭に来る
      const savedHistory = JSON.parse(
        (Storage.prototype.setItem as jest.Mock).mock.calls[0][1]
      );
      expect(savedHistory).toEqual(['React', 'TypeScript', 'JavaScript']);
      expect(savedHistory.filter(h => h === 'React')).toHaveLength(1);
    });
  });
});