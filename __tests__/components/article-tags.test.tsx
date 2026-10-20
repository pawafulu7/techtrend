/**
 * 記事詳細のタグの折りたたみ（app/articles/_components/article-tags.tsx）と、
 * 右の列の観測データ（app/components/article/observation-data.tsx）。
 *
 * - タグは最初の 5 個だけ出し、残りは「+N」のボタンで開く。隠したタグのリンクは DOM に置かない
 * - ボタンは aria-expanded と aria-controls（タグの一覧）を持ち、開いた後は「折りたたむ」で閉じる
 * - 観測データは読む時間・字数・公開と収集の時刻を dl で出す。本文の無い記事は時刻だけ
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleTags } from '@/app/articles/_components/article-tags';
import {
  ObservationData,
  readingMinutes,
} from '@/app/components/article/observation-data';

function tags(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `tag-${i + 1}`,
    name: `Tag${i + 1}`,
  }));
}

describe('ArticleTags', () => {
  it('5 個以下ならすべて出し、ボタンは出さない', () => {
    render(<ArticleTags tags={tags(5)} />);
    const list = screen.getByRole('list', { name: 'タグ' });
    expect(within(list).getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('6 個以上なら最初の 5 個と「+N」のボタンを出し、隠したタグのリンクは DOM に置かない', () => {
    render(<ArticleTags tags={tags(8)} />);
    const list = screen.getByRole('list', { name: 'タグ' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Tag1',
      'Tag2',
      'Tag3',
      'Tag4',
      'Tag5',
    ]);
    expect(links[0]).toHaveAttribute('href', '/?tags=Tag1&tagMode=OR');
    expect(screen.queryByText('Tag6')).toBeNull();

    const toggle = screen.getByRole('button', { name: '+3 件のタグを表示' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', list.id);
  });

  it('ボタンで残りのタグを開き、「折りたたむ」で閉じる', async () => {
    const user = userEvent.setup();
    render(<ArticleTags tags={tags(8)} />);

    await user.click(screen.getByRole('button', { name: '+3 件のタグを表示' }));
    const list = screen.getByRole('list', { name: 'タグ' });
    expect(within(list).getAllByRole('link')).toHaveLength(8);
    const collapse = screen.getByRole('button', { name: '折りたたむ' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    // 開閉のボタンは同じ要素のまま（押した後もフォーカスが残る）
    expect(collapse).toHaveFocus();

    await user.click(collapse);
    expect(within(list).getAllByRole('link')).toHaveLength(5);
  });

  it('タグが無ければ何も出さない', () => {
    const { container } = render(<ArticleTags tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ObservationData', () => {
  it('読む時間・字数・公開と収集の時刻を、名前と値の組で出す', () => {
    render(
      <ObservationData
        contentLength={19903}
        publishedAt="2026-10-18T00:39:00.000Z"
        createdAt="2026-10-18T00:45:00.000Z"
      />
    );
    const section = screen.getByRole('region', { name: '観測データ' });
    const terms = within(section).getAllByRole('term');
    const definitions = within(section).getAllByRole('definition');
    expect(terms.map((t) => t.textContent)).toEqual([
      '読む時間',
      '字数',
      '公開',
      '収集',
    ]);
    expect(definitions.map((d) => d.textContent)).toEqual([
      '40分',
      '19,903字',
      '2026/10/18 09:39',
      '2026/10/18 09:45',
    ]);
  });

  it('本文の無い記事は時刻だけを出す', () => {
    render(
      <ObservationData
        contentLength={0}
        publishedAt="2026-10-18T00:39:00.000Z"
        createdAt="2026-10-18T00:45:00.000Z"
      />
    );
    const section = screen.getByRole('region', { name: '観測データ' });
    expect(
      within(section)
        .getAllByRole('term')
        .map((t) => t.textContent)
    ).toEqual(['公開', '収集']);
  });

  it.each([
    [1, 1],
    [500, 1],
    [501, 2],
    [19903, 40],
  ])('本文 %i 字は %i 分', (length, minutes) => {
    expect(readingMinutes(length)).toBe(minutes);
  });
});
