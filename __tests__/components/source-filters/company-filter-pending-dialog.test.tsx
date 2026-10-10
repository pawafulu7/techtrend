import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyFilter } from '@/app/components/source-filters/company-filter';
import type { CompanySource } from '@/lib/providers/company-source';

// 一覧ダイアログの chunk が届かない状態を再現する（Issue #718）。
// モジュールを thenable にして、テストから好きな時点で解決できるようにする
// （SWC が import() を Promise.resolve().then(() => require(...)) に変えることに乗っている）
let mockResolveDialogModule: ((mod: unknown) => void) | null = null;
jest.mock('@/app/components/source-filters/company-selection-dialog', () => ({
  __esModule: true,
  then: (resolve: (mod: unknown) => void) => {
    mockResolveDialogModule = resolve;
  },
}));

const sources: CompanySource[] = [
  { id: 'cyberagent', name: 'CyberAgent', isActive: true },
  { id: 'dena', name: 'DeNA', isActive: true },
];

function renderFilter() {
  return render(
    <CompanyFilter
      sources={sources}
      visibleSources={sources}
      selectedSourceIds={[]}
      searchValue=""
      onSearchChange={jest.fn()}
      onSourceToggle={jest.fn()}
      onBatchSelect={jest.fn()}
    />
  );
}

async function resolveDialogModule() {
  const actual = jest.requireActual(
    '@/app/components/source-filters/company-selection-dialog'
  );
  await act(async () => {
    mockResolveDialogModule?.(actual);
  });
}

describe('CompanyFilter while the dialog chunk is pending', () => {
  it('does not open the dialog by itself after the section was collapsed and expanded again', async () => {
    const user = userEvent.setup();
    renderFilter();
    const trigger = screen.getByTestId('company-filter-trigger');

    await user.click(trigger);
    await user.click(await screen.findByTestId('company-filter-manage-all'));
    await waitFor(() => expect(mockResolveDialogModule).not.toBeNull());

    // 読み込み中に欄を閉じて開き直す
    await user.click(trigger);
    await user.click(trigger);
    await resolveDialogModule();

    expect(screen.queryByText('企業ブログを選択')).not.toBeInTheDocument();

    // 改めて押せば開く
    await user.click(await screen.findByTestId('company-filter-manage-all'));
    expect(await screen.findByText('企業ブログを選択')).toBeInTheDocument();
  });
});
