/**
 * リーダーの一覧の重なりの除去と、次の記事の選び方（app/reader/utils.ts）。
 * 一覧は offset でページを読むので、2 ページ目を読む間に新着が入ると、境目で同じ記事が 2 回届く
 */
import { formatDate, nextArticleIdAfter, uniqueById } from '@/app/reader/utils';

const ids = (...names: string[]) => names.map((id) => ({ id }));

describe('uniqueById', () => {
  it('同じ id の 2 件目以降を除き、最初に出た位置を保つ', () => {
    expect(
      uniqueById(ids('A1', 'A2', 'A2', 'A3', 'A1')).map((a) => a.id)
    ).toEqual(['A1', 'A2', 'A3']);
  });
});

describe('nextArticleIdAfter', () => {
  it('ページの境目で今の記事が重なっても、その次の記事を選ぶ（同じ記事に留まらない）', () => {
    // 1 ページ目の末尾 A20 が、新着が入った 2 ページ目の先頭にもう一度来る
    const pages = ids('A19', 'A20', 'A20', 'A21');
    expect(nextArticleIdAfter(pages, 'A20')).toBe('A21');
  });

  it('2 件重なっても、末尾の 2 件の間を行き来しない', () => {
    const pages = ids('A19', 'A20', 'A19', 'A20', 'A21');
    expect(nextArticleIdAfter(pages, 'A19')).toBe('A20');
    expect(nextArticleIdAfter(pages, 'A20')).toBe('A21');
  });

  it('今の記事が一覧に無い・無指定・末尾なら選ばない（番号で選ばない）', () => {
    const pages = ids('B1', 'B2');
    expect(nextArticleIdAfter(pages, 'A20')).toBeNull();
    expect(nextArticleIdAfter(pages, undefined)).toBeNull();
    expect(nextArticleIdAfter(pages, 'B2')).toBeNull();
  });
});

// 一覧と本文はサーバー（UTC）でも描くので、実行環境のタイムゾーンによらず日本時間で同じ文字列にする
describe('formatDate', () => {
  it('日本時間の日付と時刻を出す（UTC では前日の 20:30）', () => {
    expect(formatDate('2026-01-01T20:30:00.000Z')).toBe('2026.1.2 05:30');
  });

  it('時は 0 で埋め、真夜中を 00 にする', () => {
    expect(formatDate('2026-03-04T15:05:00.000Z')).toBe('2026.3.5 00:05');
  });

  it('日時として読めない値は空にする', () => {
    expect(formatDate('not a date')).toBe('');
  });
});
