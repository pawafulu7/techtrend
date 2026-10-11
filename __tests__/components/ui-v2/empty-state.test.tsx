/**
 * EmptyState: 取得に成功して0件のときの表示（issue #701）。失敗（ErrorState）と取り違えない
 */
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import '@testing-library/jest-dom';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/ui-v2/empty-state';

describe('EmptyState', () => {
  it('サーバー描画では status を空で出し、文言はマウントの後に入れる（WCAG ARIA22）', () => {
    const html = renderToString(
      <EmptyState icon={Search} title="記事がありません" />
    );
    expect(html).toMatch(/<span role="status" class="sr-only"><\/span>/);
  });

  it('見出しと説明を status で伝え、alert にはしない', async () => {
    render(
      <EmptyState
        icon={Search}
        title="条件に合う記事はありません"
        description="検索語を変えてください。"
      />
    );

    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('条件に合う記事はありません');
      expect(status).toHaveTextContent('検索語を変えてください。');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('次の操作は status の外に置く（ボタンの文言を読み上げ直させない）', () => {
    render(
      <EmptyState icon={Search} title="記事がありません">
        <button type="button">フィルターをリセット</button>
      </EmptyState>
    );

    const button = screen.getByRole('button', { name: 'フィルターをリセット' });
    expect(screen.getByRole('status')).not.toContainElement(button);
  });

  it('説明と操作は渡したときだけ出す', async () => {
    render(<EmptyState icon={Search} title="記事がありません" />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /^記事がありません$/
      );
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
