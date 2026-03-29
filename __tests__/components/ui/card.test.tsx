/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui-v2/card-v2';

describe('Card Component', () => {
  describe('Card', () => {
    it('TTトークンベースのスタイルが適用される', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('bg-(--tt-color-surface)');
      expect(card).toHaveClass('border-(--tt-color-border)');
      expect(card).toHaveClass('border');
    });

    it('data-slot属性が設定される', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('data-slot', 'card');
    });

    it('variant="hover"でcard-hoverクラスが適用される', () => {
      render(
        <Card variant="hover" data-testid="card">
          Content
        </Card>
      );
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('card-hover');
    });

    it('variant="ghost"でborder-noneが適用される', () => {
      render(
        <Card variant="ghost" data-testid="card">
          Content
        </Card>
      );
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('border-none');
      expect(card).toHaveClass('shadow-none');
    });
  });

  describe('CardTitle', () => {
    it('デフォルトでh3要素として描画される', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title.tagName).toBe('H3');
    });

    it('適切なスタイルクラスが適用される', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('tracking-tight');
    });

    it('カスタムクラスが追加できる', () => {
      render(
        <CardTitle data-testid="title" className="custom-class">
          Title
        </CardTitle>
      );
      const title = screen.getByTestId('title');
      expect(title).toHaveClass('custom-class');
      expect(title).toHaveClass('leading-none');
    });
  });

  describe('Card with semantic CardTitle', () => {
    it('セマンティックな構造でCardを使用できる', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>記事タイトル</CardTitle>
          </CardHeader>
          <CardContent>
            <p>記事の内容</p>
          </CardContent>
        </Card>
      );
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        '記事タイトル'
      );
      expect(screen.getByText('記事の内容')).toBeInTheDocument();
    });
  });
});
