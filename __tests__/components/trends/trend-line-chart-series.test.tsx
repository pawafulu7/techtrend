/**
 * 分析の折れ線（app/components/trends/TrendLineChart.tsx）の系列の見分け方と日付の表示。
 * - 色だけで見分けなくてよいよう、系列ごとに線の種類と点の形を変える。上位 10 タグ（10 系列）で
 *   同じ組み合わせが出ないことを確かめる
 * - 日付のキーは日本時間の暦日の文字列。Date に戻さずに整形し、閲覧者のタイムゾーンで前日にならない
 */
import {
  formatDateLabel,
  formatDateTick,
  seriesStyle,
} from '@/app/components/trends/TrendLineChart';

describe('seriesStyle', () => {
  it('10 系列の線の種類と点の形の組み合わせはすべて違う', () => {
    const combos = Array.from({ length: 10 }, (_, i) => {
      const { dash, marker } = seriesStyle(i);
      return `${dash}|${marker}`;
    });
    expect(new Set(combos).size).toBe(10);
  });

  it('最初の系列は実線と丸の点（以前と同じ見た目）', () => {
    expect(seriesStyle(0)).toEqual({ dash: '0', marker: 'circle' });
  });
});

describe('日付の表示', () => {
  it('YYYY-MM-DD をそのまま M/D・Y/M/D にする（Date に戻さない）', () => {
    expect(formatDateTick('2026-10-01')).toBe('10/1');
    expect(formatDateLabel('2026-10-01')).toBe('2026/10/1');
  });

  it('閲覧者のタイムゾーンが UTC より西でも前日にならない', () => {
    // Jest のワーカーでは process.env.TZ を書き換えてもタイムゾーンが変わらないので、
    // Date の現地時刻の取り出しを UTC−7（夏の Los Angeles）の値に差し替えて再現する
    const WEST_MS = -7 * 60 * 60 * 1000;
    const west = (d: Date) => new Date(d.getTime() + WEST_MS);
    const spies = [
      jest
        .spyOn(Date.prototype, 'getDate')
        .mockImplementation(function (this: Date) {
          return west(this).getUTCDate();
        }),
      jest
        .spyOn(Date.prototype, 'getMonth')
        .mockImplementation(function (this: Date) {
          return west(this).getUTCMonth();
        }),
      jest
        .spyOn(Date.prototype, 'getFullYear')
        .mockImplementation(function (this: Date) {
          return west(this).getUTCFullYear();
        }),
      jest
        .spyOn(Date.prototype, 'toLocaleDateString')
        .mockImplementation(function (this: Date) {
          const d = west(this);
          return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        }),
    ];
    try {
      expect(formatDateTick('2026-10-20')).toBe('10/20');
      expect(formatDateLabel('2026-10-20')).toBe('2026/10/20');
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
