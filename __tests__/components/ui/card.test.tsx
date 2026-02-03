/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

describe('Card Component', () => {
  describe('Card', () => {
    it('TTトークンベースのスタイルが適用される', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('bg-(--tt-color-surface)');
      expect(card).toHaveClass('border-(--tt-color-border)');
      // borderクラスの存在も検証（回帰防止）
      expect(card).toHaveClass('border');
    });

    it('data-slotが設定される', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('data-slot', 'card');
    });
  });

  describe('CardTitle', () => {
    it('デフォルトでdiv要素として描画される', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title.tagName).toBe('DIV');
    });

    it('asChild=trueで子要素にスタイルが適用される', () => {
      render(
        <CardTitle asChild>
          <h2>Heading Title</h2>
        </CardTitle>
      );
      const title = screen.getByRole('heading', { level: 2 });
      expect(title).toHaveTextContent('Heading Title');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('font-semibold');
    });

    it('asChild=trueでpropsが子要素に転送される', () => {
      render(
        <CardTitle
          asChild
          data-testid="forwarded-title"
          className="custom-class"
        >
          <h2>Title with Props</h2>
        </CardTitle>
      );
      const title = screen.getByTestId('forwarded-title');
      expect(title).toHaveClass('custom-class');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveAttribute('data-slot', 'card-title');
    });

    it('asChild=trueでh3要素として使用できる', () => {
      render(
        <CardTitle asChild>
          <h3>Card Section Title</h3>
        </CardTitle>
      );
      const title = screen.getByRole('heading', { level: 3 });
      expect(title).toBeInTheDocument();
    });
  });

  describe('Card with semantic CardTitle', () => {
    it('セマンティックな構造でCardを使用できる', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>記事タイトル</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>記事の内容</p>
          </CardContent>
        </Card>
      );
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        '記事タイトル'
      );
      expect(screen.getByText('記事の内容')).toBeInTheDocument();
    });
  });
});
