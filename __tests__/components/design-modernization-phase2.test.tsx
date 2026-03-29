/**
 * @jest-environment jsdom
 */
/**
 * Design Modernization Phase 2 - 統合テスト
 *
 * このテストは Phase 2 の変更が正しく「統合」されていることを検証します。
 * 単体テストで担保済みの項目（TTトークンクラス名等）は除外し、
 * 複数コンポーネントの組み合わせ・a11yの相互作用に焦点を当てます。
 *
 * TTトークンのクラス名検証は以下の単体テストで担保:
 * - __tests__/components/ui-v2/page-header.test.tsx
 * - __tests__/components/ui/card.test.tsx
 */
import { render, screen, within } from '@testing-library/react';
import { PageHeader } from '@/components/ui-v2/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui-v2/card-v2';
import { TrendingUp, Settings } from 'lucide-react';

describe('Design Modernization Phase 2 Integration', () => {
  describe('PageHeader a11y Integration', () => {
    it('アイコンコンテナがaria-hidden="true"でSVGを内包している', () => {
      render(
        <PageHeader
          icon={TrendingUp}
          title="テストページ"
          data-testid="page-header"
        />
      );
      const header = screen.getByTestId('page-header');
      const iconContainer = header.querySelector('[aria-hidden="true"]');
      expect(iconContainer).toBeInTheDocument();
      // SVGアイコンが内包されていることを確認
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('カウントがheader内のstatus roleでaria-live="polite"を持つ', () => {
      render(
        <PageHeader
          icon={TrendingUp}
          title="テストページ"
          count={{ value: 100, label: '100件' }}
          data-testid="page-header"
        />
      );
      const header = screen.getByTestId('page-header');
      // withinでスコープを絞り込み
      const countElement = within(header).getByRole('status');
      expect(countElement).toHaveAttribute('aria-live', 'polite');
      expect(countElement).toHaveTextContent('100件');
    });

    it('タイトルがh1としてレンダリングされる', () => {
      render(
        <PageHeader
          icon={TrendingUp}
          title="トレンド分析"
          data-testid="page-header"
        />
      );
      // セマンティクスを明示的に検証
      expect(
        screen.getByRole('heading', { level: 1, name: 'トレンド分析' })
      ).toBeInTheDocument();
    });
  });

  describe('CardTitle セマンティクス Integration', () => {
    it('h3としてレンダリングされスタイルが適用される', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>セマンティックなタイトル</CardTitle>
          </CardHeader>
          <CardContent>
            <p>コンテンツ</p>
          </CardContent>
        </Card>
      );
      const heading = screen.getByRole('heading', {
        level: 3,
        name: 'セマンティックなタイトル',
      });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('leading-none');
      expect(heading).toHaveClass('font-semibold');
    });
  });

  describe('Full Page Integration', () => {
    it('PageHeaderとCard組み合わせでセマンティックな構造が維持される', () => {
      render(
        <div data-testid="page-container">
          <PageHeader
            icon={Settings}
            title="設定ページ"
            description="アプリケーションの設定を管理"
            data-testid="settings-header"
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <Card data-testid="card-1">
              <CardHeader>
                <CardTitle>設定項目1</CardTitle>
              </CardHeader>
              <CardContent>
                <p>設定内容</p>
              </CardContent>
            </Card>
            <Card data-testid="card-2">
              <CardHeader>
                <CardTitle>設定項目2</CardTitle>
              </CardHeader>
              <CardContent>
                <p>別の設定</p>
              </CardContent>
            </Card>
          </div>
        </div>
      );

      // PageHeader h1 セマンティクス検証
      expect(
        screen.getByRole('heading', { level: 1, name: '設定ページ' })
      ).toBeInTheDocument();

      // 複数のCard h3 セマンティクス検証（見出し階層が正しいか）
      const h3Headings = screen.getAllByRole('heading', { level: 3 });
      expect(h3Headings).toHaveLength(2);
      expect(h3Headings[0]).toHaveTextContent('設定項目1');
      expect(h3Headings[1]).toHaveTextContent('設定項目2');

      // Card同士が独立して存在することを確認
      expect(screen.getByTestId('card-1')).toBeInTheDocument();
      expect(screen.getByTestId('card-2')).toBeInTheDocument();
    });

    it('PageHeader descriptionとCard contentが共存できる', () => {
      render(
        <div>
          <PageHeader
            icon={Settings}
            title="設定"
            description="ページの説明文"
          />
          <Card>
            <CardContent>
              <p>カードの内容</p>
            </CardContent>
          </Card>
        </div>
      );

      // 両方のテキストが存在することを確認
      expect(screen.getByText('ページの説明文')).toBeInTheDocument();
      expect(screen.getByText('カードの内容')).toBeInTheDocument();
    });
  });
});
