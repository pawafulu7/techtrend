/**
 * collect-feeds.ts の isAcceptableEnrichedContent 境界テスト
 *
 * 新規保存経路・既存記事の自己修復経路の両方が共有する受入基準:
 * 500文字以上は無条件、250-499文字は isHighQuality（品質チェック）必須。
 * isHighQuality はモックし、文字数の境界値だけを検証する。
 */

jest.mock('@/lib/enrichers/strategies/quality', () => ({
  isHighQuality: jest.fn(),
}));

import { isAcceptableEnrichedContent } from '@/scripts/scheduled/collect-feeds';
import { isHighQuality } from '@/lib/enrichers/strategies/quality';

const mockIsHighQuality = isHighQuality as jest.Mock;

describe('isAcceptableEnrichedContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('249文字はisHighQuality=trueでもfalse（250文字未満は無条件で不採用）', () => {
    mockIsHighQuality.mockReturnValue(true);

    expect(isAcceptableEnrichedContent('a'.repeat(249))).toBe(false);
    expect(mockIsHighQuality).not.toHaveBeenCalled();
  });

  it('250文字はisHighQuality=trueならtrue', () => {
    mockIsHighQuality.mockReturnValue(true);
    const content = 'a'.repeat(250);

    expect(isAcceptableEnrichedContent(content)).toBe(true);
    expect(mockIsHighQuality).toHaveBeenCalledWith(content);
  });

  it('250文字はisHighQuality=falseならfalse', () => {
    mockIsHighQuality.mockReturnValue(false);

    expect(isAcceptableEnrichedContent('a'.repeat(250))).toBe(false);
  });

  it('499文字はisHighQuality=falseならfalse', () => {
    mockIsHighQuality.mockReturnValue(false);

    expect(isAcceptableEnrichedContent('a'.repeat(499))).toBe(false);
  });

  it('499文字はisHighQuality=trueならtrue', () => {
    mockIsHighQuality.mockReturnValue(true);

    expect(isAcceptableEnrichedContent('a'.repeat(499))).toBe(true);
  });

  it('500文字はisHighQuality=falseでも無条件でtrue', () => {
    mockIsHighQuality.mockReturnValue(false);

    expect(isAcceptableEnrichedContent('a'.repeat(500))).toBe(true);
    // 500文字以上は短絡評価によりisHighQualityが呼ばれない
    expect(mockIsHighQuality).not.toHaveBeenCalled();
  });
});
