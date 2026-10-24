/**
 * URL に無い一覧の条件（ソース・並び順）を Cookie から補う（ホームとリーダーで共通、Issue #709）
 */

import { resolveHomeFilterDefaults } from '@/lib/articles/home-filter-defaults';

function cookieStore(values: Record<string, string>) {
  return {
    get: (name: string) =>
      name in values ? { value: values[name] } : undefined,
  };
}

const filterPreferences = (prefs: Record<string, unknown>) =>
  cookieStore({ 'filter-preferences': JSON.stringify(prefs) });

const validSourceIds = new Set(['src-a', 'src-b']);

describe('resolveHomeFilterDefaults', () => {
  it('URL に無いときは Cookie のソースと並び順を使う', () => {
    const result = resolveHomeFilterDefaults({
      params: {},
      cookieStore: filterPreferences({
        sources: ['src-a'],
        sortBy: 'qualityScore',
      }),
      validSourceIds,
    });

    expect(result.initialSourceIds).toEqual(['src-a']);
    expect(result.initialSortBy).toBe('qualityScore');
  });

  it('URL の sources・sortBy があれば Cookie より優先する', () => {
    const result = resolveHomeFilterDefaults({
      params: { sources: 'src-b', sortBy: 'publishedAt' },
      cookieStore: filterPreferences({
        sources: ['src-a'],
        sortBy: 'qualityScore',
      }),
      validSourceIds,
    });

    expect(result.initialSourceIds).toEqual(['src-b']);
    expect(result.initialSortBy).toBeUndefined();
  });

  it('URL の sources=all は全選択、none は全解除', () => {
    const store = cookieStore({});
    expect(
      resolveHomeFilterDefaults({
        params: { sources: 'all' },
        cookieStore: store,
        validSourceIds,
      }).initialSourceIds
    ).toBeUndefined();
    expect(
      resolveHomeFilterDefaults({
        params: { sources: 'none' },
        cookieStore: store,
        validSourceIds,
      }).initialSourceIds
    ).toEqual([]);
  });

  it('URL に sourceId があるときは Cookie のソースを使わない', () => {
    const result = resolveHomeFilterDefaults({
      params: { sourceId: 'src-b' },
      cookieStore: filterPreferences({ sources: ['src-a'] }),
      validSourceIds,
    });

    expect(result.initialSourceIds).toBeUndefined();
  });

  it('消えた・除外したソースは落とし、全部無ければ全選択に戻す', () => {
    expect(
      resolveHomeFilterDefaults({
        params: {},
        cookieStore: filterPreferences({ sources: ['src-a', 'gone'] }),
        validSourceIds,
      }).initialSourceIds
    ).toEqual(['src-a']);
    expect(
      resolveHomeFilterDefaults({
        params: {},
        cookieStore: filterPreferences({ sources: ['gone'] }),
        validSourceIds,
      }).initialSourceIds
    ).toBeUndefined();
  });

  it('filter-preferences が無ければ、古い source-filter の Cookie を使う', () => {
    const result = resolveHomeFilterDefaults({
      params: {},
      cookieStore: cookieStore({ 'source-filter': 'src-b' }),
      validSourceIds,
    });

    expect(result.initialSourceIds).toEqual(['src-b']);
  });
});
