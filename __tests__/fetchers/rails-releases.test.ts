/**
 * RailsReleasesFetcher のテスト
 *
 * プレリリース（beta・rc）と正式版を別のタイトルにする。識別子を落とすと、
 * 「Rails 8.1.0 リリース」が3つ並び、収集のタイトルの重複判定で後の版が落ちる。
 */

import { RailsReleasesFetcher } from '@/lib/fetchers/rails-releases';
import { isDuplicate } from '@/lib/utils/duplicate-detection';
import type { Source } from '@/lib/prisma-exports';

const mockParseURL = jest.fn();
jest.mock('rss-parser', () =>
  jest.fn().mockImplementation(() => ({ parseURL: mockParseURL }))
);

const source = {
  id: 'rails_releases',
  name: 'Rails Releases',
  url: 'https://github.com/rails/rails/releases.atom',
  type: 'RSS',
  enabled: true,
} as unknown as Source;

function release(title: string, day: number) {
  return {
    title,
    link: `https://github.com/rails/rails/releases/tag/${title}`,
    isoDate: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
    content: '<p>release notes</p>',
  };
}

describe('RailsReleasesFetcher', () => {
  beforeEach(() => mockParseURL.mockReset());

  it('beta・rc・正式版を別のタイトルにし、互いに重複と判定されない', async () => {
    mockParseURL.mockResolvedValue({
      items: [release('v8.1.0', 3), release('v8.1.0.rc1', 2), release('v8.1.0.beta1', 1)],
    });

    const { articles, errors } = await new RailsReleasesFetcher(source).fetch();

    expect(errors).toEqual([]);
    const titles = articles.map((a) => a.title);
    expect(titles).toEqual([
      'Rails 8.1.0 リリース',
      'Rails 8.1.0.rc1 リリース',
      'Rails 8.1.0.beta1 リリース',
    ]);
    expect(isDuplicate(titles[0], titles[1], 0.85)).toBe(false);
    expect(isDuplicate(titles[1], titles[2], 0.85)).toBe(false);
    expect(mockParseURL).toHaveBeenCalledWith(source.url);
  });

  it('4つの数字の版（セキュリティの修正版）も、そのまま残す', async () => {
    mockParseURL.mockResolvedValue({ items: [release('8.1.3.1', 5), release('8.1.3', 4)] });

    const { articles } = await new RailsReleasesFetcher(source).fetch();

    expect(articles.map((a) => a.title)).toEqual(['Rails 8.1.3.1 リリース', 'Rails 8.1.3 リリース']);
  });
});
