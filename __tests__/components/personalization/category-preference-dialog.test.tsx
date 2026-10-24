/**
 * CategoryPreferenceDialog（興味の分野の設定）
 *
 * 分野はホームとダイジェストで共通（Issue #709）。ホームから開いたときだけ、ホームの一覧を
 * 絞り込むかどうかのスイッチを出し、保存するときにその値を渡す。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CategoryPreferenceDialog } from '@/app/components/personalization/category-preference-dialog';
import type { InterestCategoryWithCount } from '@/lib/personalization/types';

const categories: InterestCategoryWithCount[] = [
  {
    id: 'cat-1',
    slug: 'frontend',
    name: 'フロントエンド',
    description: null,
    icon: null,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'cat-2',
    slug: 'backend',
    name: 'バックエンド',
    description: null,
    icon: null,
    sortOrder: 2,
    isActive: true,
  },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof CategoryPreferenceDialog>> = {}
) {
  const onSave = jest.fn().mockResolvedValue(undefined);
  render(
    <CategoryPreferenceDialog
      open
      onOpenChange={jest.fn()}
      categories={categories}
      selectedCategories={['cat-1']}
      selectedPeriod={12}
      onSave={onSave}
      {...props}
    />
  );
  return { onSave };
}

describe('CategoryPreferenceDialog', () => {
  it('ホームから開いたときは、ホームの絞り込みのスイッチを今の値で出す', () => {
    renderDialog({ homeFilterEnabled: false });

    expect(
      screen.getByRole('switch', { name: 'ホームの一覧をこの分野で絞り込む' })
    ).not.toBeChecked();
  });

  it('スイッチだけを変えても保存でき、その値を渡す', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ homeFilterEnabled: false });

    const save = screen.getByRole('button', { name: '保存' });
    expect(save).toBeDisabled();

    await user.click(
      screen.getByRole('switch', { name: 'ホームの一覧をこの分野で絞り込む' })
    );
    expect(save).toBeEnabled();
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith(['cat-1'], 12, true);
  });

  it('ダイジェストから開いたとき（homeFilterEnabled なし）はスイッチを出さない', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ showPeriodSelector: false });

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /バックエンド/ }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledWith(['cat-1', 'cat-2'], 12, false);
  });
});
