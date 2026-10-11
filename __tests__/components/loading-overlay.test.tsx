/**
 * LoadingOverlay: 奥のスケルトンは操作・読み上げの対象から外し、前面のスピナーだけで
 * 読み込み中を伝える（issue #701）
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';

describe('LoadingOverlay', () => {
  it('前面のスピナーの文言を status で伝える', () => {
    render(
      <LoadingOverlay message="トレンドを読み込んでいます...">
        <div>skeleton</div>
      </LoadingOverlay>
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'トレンドを読み込んでいます...'
    );
  });

  it('奥のリンクは inert で Tab のフォーカスからも外す', () => {
    render(
      <LoadingOverlay message="読み込んでいます...">
        <a href="/trends/daily">デイリーレポート</a>
      </LoadingOverlay>
    );

    const link = screen.getByText('デイリーレポート');
    expect(link.closest('[inert]')).not.toBeNull();
  });
});
