/**
 * 品質の目盛りの段（app/components/article/quality-meter.tsx）。品質（0〜100）を 25 点ごとに 4 段で表す。
 */
import { qualityMeterLevel } from '@/app/components/article/quality-meter';

describe('qualityMeterLevel（品質 0〜100 → 4 段）', () => {
  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [65, 2],
    [75, 3],
    [99, 3],
    [74.5, 3], // 表示する点数（75）と同じく四捨五入してから段を決める
    [74.4, 2],
    [100, 4],
    [130, 4],
    [Number.NaN, 0],
  ])('%s 点 → %i 段', (score, level) => {
    expect(qualityMeterLevel(score)).toBe(level);
  });
});
