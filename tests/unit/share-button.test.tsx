import { render, screen, fireEvent } from '@testing-library/react';
import { ShareButton } from '@/app/components/article/share-button';

// Mockウィンドウオープン
const mockOpen = jest.fn();
global.open = mockOpen;

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

  it('ドロップダウンメニューが開閉する', () => {
    render(<ShareButton {...defaultProps} />);
    
    // 初期状態ではメニューが表示されない
    expect(screen.queryByText('記事を共有')).not.toBeInTheDocument();
    
    // ボタンをクリックするとメニューが表示される
    const button = screen.getByTitle('記事を共有');
    fireEvent.click(button);
    
    expect(screen.getByText('記事を共有')).toBeInTheDocument();
    expect(screen.getByText('Twitterで共有')).toBeInTheDocument();
    expect(screen.getByText('はてなブックマーク')).toBeInTheDocument();
  });

  it('Twitter共有が正しいURLで開く', () => {
    render(<ShareButton {...defaultProps} />);
    
    const button = screen.getByTitle('記事を共有');
    fireEvent.click(button);
    
    const twitterOption = screen.getByText('Twitterで共有');
    fireEvent.click(twitterOption);
    
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('https://twitter.com/intent/tweet'),
      '_blank',
      'noopener,noreferrer,width=550,height=400'
    );
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.title));
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.url));
  });

  it('はてなブックマーク共有が正しいURLで開く', () => {
    render(<ShareButton {...defaultProps} />);
    
    const button = screen.getByTitle('記事を共有');
    fireEvent.click(button);
    
    const hatenaOption = screen.getByText('はてなブックマーク');
    fireEvent.click(hatenaOption);
    
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('https://b.hatena.ne.jp/entry/'),
      '_blank',
      'noopener,noreferrer'
    );
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(defaultProps.url));
  });

  it('特殊文字を含むタイトルとURLが正しくエンコードされる', () => {
    const specialProps = {
      title: 'テスト記事 & タイトル #タグ',
      url: 'https://example.com/article?id=123&category=test',
    };
    
    render(<ShareButton {...specialProps} />);
    
    const button = screen.getByTitle('記事を共有');
    fireEvent.click(button);
    
    const twitterOption = screen.getByText('Twitterで共有');
    fireEvent.click(twitterOption);
    
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(specialProps.title));
    expect(calledUrl).toContain(encodeURIComponent(specialProps.url));
  });

  it('stopPropagationが正しく動作する', () => {
    const mockParentClick = jest.fn();
    
    render(
      <div onClick={mockParentClick}>
        <ShareButton {...defaultProps} />
      </div>
    );
    
    const button = screen.getByTitle('記事を共有');
    fireEvent.click(button);
    
    // 親要素のクリックイベントが発火しないことを確認
    expect(mockParentClick).not.toHaveBeenCalled();
  });
});