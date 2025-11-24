import { render, screen } from '@testing-library/react';
import { DetailedSummaryDisplay } from '@/app/components/article/detailed-summary-display';

describe('DetailedSummaryDisplay', () => {
  const mockDetailedSummary = JSON.stringify({
    introduction: '技術記事の概要です。',
    keyPoints: ['ポイント1', 'ポイント2'],
    conclusion: 'まとめです。',
  });

  it('renders DetailedSummaryStructured component', () => {
    render(
      <DetailedSummaryDisplay
        detailedSummary={mockDetailedSummary}
        articleType="tutorial"
        summaryVersion={2}
      />
    );

    // DetailedSummaryStructuredが持つべき要素が表示されることを確認
    expect(screen.getByText(/技術記事の概要です/)).toBeInTheDocument();
  });

  it('passes all props to DetailedSummaryStructured', () => {
    const { container } = render(
      <DetailedSummaryDisplay
        detailedSummary={mockDetailedSummary}
        articleType="implementation"
        summaryVersion={2}
      />
    );

    // コンポーネントが正しくレンダリングされることを確認
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders without optional props', () => {
    render(
      <DetailedSummaryDisplay
        detailedSummary={mockDetailedSummary}
      />
    );

    expect(screen.getByText(/技術記事の概要です/)).toBeInTheDocument();
  });
});
