import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Heart } from 'lucide-react';

describe('PageHeader', () => {
  it('renders title correctly', () => {
    render(<PageHeader icon={Heart} title="お気に入り" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'お気に入り'
    );
  });

  it('renders description when provided', () => {
    render(
      <PageHeader
        icon={Heart}
        title="お気に入り"
        description="保存した記事を管理"
      />
    );
    expect(screen.getByText('保存した記事を管理')).toBeInTheDocument();
  });

  it('renders count with aria-live for screen readers', () => {
    render(
      <PageHeader
        icon={Heart}
        title="お気に入り"
        count={{ value: 5, label: '5件' }}
      />
    );
    // 実装は "(5件)" と括弧付きで表示するため、正規表現でマッチ
    const countElement = screen.getByText(/5件/);
    expect(countElement).toHaveAttribute('aria-live', 'polite');
  });

  it('renders actions slot', () => {
    render(
      <PageHeader
        icon={Heart}
        title="お気に入り"
        actions={<button>アクション</button>}
      />
    );
    expect(
      screen.getByRole('button', { name: 'アクション' })
    ).toBeInTheDocument();
  });

  it('applies compact variant styles', () => {
    const { container } = render(
      <PageHeader icon={Heart} title="お気に入り" variant="compact" />
    );
    expect(container.firstChild).toHaveClass('p-3');
  });

  it('hides icon from screen readers', () => {
    const { container } = render(
      <PageHeader icon={Heart} title="お気に入り" />
    );
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('has correct a11y attributes', () => {
    const { container } = render(
      <PageHeader
        icon={Heart}
        title="お気に入り"
        description="保存した記事"
        count={{ value: 3, label: '3件' }}
      />
    );
    // Check that count has role="status" and aria-live="polite"
    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    // Check that icon wrapper has aria-hidden
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
  });
});
