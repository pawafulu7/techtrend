/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

// テスト対象のヘルパー関数（trends/page.tsxから抽出）
// 注意: 実装と同期を保つこと
const getGrowthIconWithA11y = (rate: number) => {
  const levels = [
    { threshold: 100, icon: '🚀', label: '急上昇' },
    { threshold: 50, icon: '📈', label: '上昇' },
    { threshold: 20, icon: '📊', label: '微増' },
    { threshold: -Infinity, icon: '📉', label: '減少' },
  ];

  const level =
    levels.find((l) => rate >= l.threshold) || levels[levels.length - 1];

  return (
    <span
      className="text-lg"
      role="img"
      aria-label={`${level.label}（${rate >= 0 ? '+' : ''}${rate}%）`}
    >
      {level.icon}
      <span className="sr-only">{level.label}</span>
    </span>
  );
};

describe('Trends Page A11y', () => {
  describe('getGrowthIconWithA11y', () => {
    it('100%以上で「急上昇」のsr-onlyテキストを含む', () => {
      render(<div data-testid="icon">{getGrowthIconWithA11y(150)}</div>);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('急上昇');
      expect(icon.querySelector('.sr-only')).toBeInTheDocument();
    });

    it('50%以上100%未満で「上昇」のsr-onlyテキストを含む', () => {
      render(<div data-testid="icon">{getGrowthIconWithA11y(75)}</div>);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('上昇');
    });

    it('20%以上50%未満で「微増」のsr-onlyテキストを含む', () => {
      render(<div data-testid="icon">{getGrowthIconWithA11y(30)}</div>);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('微増');
    });

    it('20%未満で「減少」のsr-onlyテキストを含む', () => {
      render(<div data-testid="icon">{getGrowthIconWithA11y(10)}</div>);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('減少');
    });

    it('マイナス値でも「減少」のsr-onlyテキストを含む', () => {
      render(<div data-testid="icon">{getGrowthIconWithA11y(-20)}</div>);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('減少');
    });

    it('正の値でrole="img"とaria-labelが+付きで設定されている', () => {
      render(<div>{getGrowthIconWithA11y(100)}</div>);
      const imgRole = screen.getByRole('img');
      expect(imgRole).toHaveAttribute('aria-label', '急上昇（+100%）');
    });

    it('負の値でaria-labelが符号なしで設定されている', () => {
      render(<div>{getGrowthIconWithA11y(-20)}</div>);
      const imgRole = screen.getByRole('img');
      expect(imgRole).toHaveAttribute('aria-label', '減少（-20%）');
    });
  });
});
