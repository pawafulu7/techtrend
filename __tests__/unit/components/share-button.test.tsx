import { render, screen, _waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from '@/app/components/article/share-button';

// Mockウィンドウオープン
const mockOpen = jest.fn();
global.open = mockOpen;

// Radix UIコンポーネントのモック
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, _asChild }: { children: React.ReactNode; _asChild?: boolean }) => 
    <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => 
    <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => 
    <div data-testid="dropdown-item" onClick={onClick}>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => 
    <div data-testid="dropdown-label">{children}</div>,
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
}));

describe('ShareButton', () => {
  const defaultProps = {
    title: 'テスト記事タイトル',
    url: 'https://example.com/article/123',
  };

  beforeEach(() => {
    mockOpen.mockClear();
  });

  it('共有ボタンが正しくレンダリングされる', () => {
    render(<ShareButton {...defaultProps} />);
    
    const button = screen.getByTitle('記事を共有');
    expect(button).toBeInTheDocument();
  });

  it('Twitter共有が正しいURLで開く', async () => {
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    
    // Twitterで共有をクリック
    const twitterItems = screen.getAllByTestId('dropdown-item');
    const twitterItem = twitterItems.find(item => item.textContent?.includes('Twitterで共有'));
    expect(twitterItem).toBeDefined();
    await user.click(twitterItem!);
    
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('https://twitter.com/intent/tweet'),
      '_blank',
      'noopener,noreferrer,width=550,height=400'
    );
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.title));
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.url));
  });

  it('はてなブックマーク共有が正しいURLで開く', async () => {
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    
    // はてなブックマークをクリック
    const hatenaItems = screen.getAllByTestId('dropdown-item');
    const hatenaItem = hatenaItems.find(item => item.textContent?.includes('はてなブックマーク'));
    expect(hatenaItem).toBeDefined();
    await user.click(hatenaItem!);
    
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('https://b.hatena.ne.jp/entry/'),
      '_blank',
      'noopener,noreferrer'
    );
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.url));
  });

  it('特殊文字を含むタイトルとURLが正しくエンコードされる', async () => {
    const user = userEvent.setup();
    const specialProps = {
      title: 'テスト記事 & タイトル #タグ',
      url: 'https://example.com/article?id=123&category=test',
    };
    
    render(<ShareButton {...specialProps} />);
    
    // Twitterで共有をクリック
    const twitterItems = screen.getAllByTestId('dropdown-item');
    const twitterItem = twitterItems.find(item => item.textContent?.includes('Twitterで共有'));
    await user.click(twitterItem!);
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(specialProps.title));
    expect(calledUrl).toContain(encodeURIComponent(specialProps.url));
  });

  it('stopPropagationが正しく動作する', async () => {
    const user = userEvent.setup();
    const mockParentClick = jest.fn();
    
    render(
      <div onClick={mockParentClick}>
        <ShareButton {...defaultProps} />
      </div>
    );
    
    const button = screen.getByTitle('記事を共有');
    await user.click(button);
    
    // 親要素のクリックイベントが発火しないことを確認
    expect(mockParentClick).not.toHaveBeenCalled();
  });
});