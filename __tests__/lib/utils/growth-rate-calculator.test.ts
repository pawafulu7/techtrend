import {
  calculateGrowthRate,
  redistributeWeights,
  sigmoidNormalize,
} from '@/lib/utils/growth-rate-calculator';

describe('calculateGrowthRate', () => {
  it('should calculate positive growth rate', () => {
    // (150 - 100) / 100 * 100 = 50%
    expect(calculateGrowthRate(150, 100)).toBe(50);
  });

  it('should calculate negative growth rate', () => {
    // (50 - 100) / 100 * 100 = -50%
    expect(calculateGrowthRate(50, 100)).toBe(-50);
  });

  it('should return 100 when previous is 0 and current is positive', () => {
    expect(calculateGrowthRate(10, 0)).toBe(100);
  });

  it('should return 0 when both current and previous are 0', () => {
    expect(calculateGrowthRate(0, 0)).toBe(0);
  });

  it('should clip to max 500', () => {
    // (10000 - 1) / 1 * 100 = 999900% -> clipped to 500
    expect(calculateGrowthRate(10000, 1)).toBe(500);
  });

  it('should clip to min -100', () => {
    // (-200 - 100) / 100 * 100 = -300% -> clipped to -100
    expect(calculateGrowthRate(-200, 100)).toBe(-100);
  });

  it('should use custom clip options', () => {
    const result = calculateGrowthRate(10000, 1, {
      clipMin: -50,
      clipMax: 200,
    });
    expect(result).toBe(200);
  });

  it('should use custom clipMin option', () => {
    const result = calculateGrowthRate(-200, 100, { clipMin: -50 });
    expect(result).toBe(-50);
  });

  it('should return exact growth rate within clip range', () => {
    // (200 - 100) / 100 * 100 = 100%
    expect(calculateGrowthRate(200, 100)).toBe(100);
  });

  it('should handle small fractional values', () => {
    // (0.2 - 0.1) / 0.1 * 100 = 100%
    const result = calculateGrowthRate(0.2, 0.1);
    expect(result).toBeCloseTo(100);
  });
});

describe('redistributeWeights', () => {
  const fullWeights = {
    ARTICLE_MENTION: 0.35,
    GITHUB_STARS: 0.25,
    NPM_DOWNLOADS: 0.25,
    SO_QUESTIONS: 0.15,
  };

  it('should return proportionally redistributed weights when all keys available', () => {
    const allKeys = new Set([
      'ARTICLE_MENTION',
      'GITHUB_STARS',
      'NPM_DOWNLOADS',
      'SO_QUESTIONS',
    ]);
    const result = redistributeWeights(fullWeights, allKeys);

    // Total = 1.0, so each weight / 1.0 = same value
    expect(result.ARTICLE_MENTION).toBeCloseTo(0.35);
    expect(result.GITHUB_STARS).toBeCloseTo(0.25);
    expect(result.NPM_DOWNLOADS).toBeCloseTo(0.25);
    expect(result.SO_QUESTIONS).toBeCloseTo(0.15);
  });

  it('should redistribute proportionally when some keys are missing', () => {
    // Only ARTICLE_MENTION and GITHUB_STARS available
    // Total available = 0.35 + 0.25 = 0.60
    const partialKeys = new Set(['ARTICLE_MENTION', 'GITHUB_STARS']);
    const result = redistributeWeights(fullWeights, partialKeys);

    expect(result.ARTICLE_MENTION).toBeCloseTo(0.35 / 0.6);
    expect(result.GITHUB_STARS).toBeCloseTo(0.25 / 0.6);
    expect(result.NPM_DOWNLOADS).toBeUndefined();
    expect(result.SO_QUESTIONS).toBeUndefined();
  });

  it('should redistribute with single key available', () => {
    const singleKey = new Set(['ARTICLE_MENTION']);
    const result = redistributeWeights(fullWeights, singleKey);

    // Single key gets weight 1.0 (0.35 / 0.35)
    expect(result.ARTICLE_MENTION).toBeCloseTo(1.0);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('should return original weights when no keys are available', () => {
    const emptyKeys = new Set<string>();
    const result = redistributeWeights(fullWeights, emptyKeys);

    // totalAvailable = 0, so returns original weights
    expect(result).toEqual(fullWeights);
  });

  it('should sum to 1.0 for any combination of available keys', () => {
    const someKeys = new Set([
      'ARTICLE_MENTION',
      'NPM_DOWNLOADS',
      'SO_QUESTIONS',
    ]);
    const result = redistributeWeights(fullWeights, someKeys);

    const total = Object.values(result).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1.0);
  });
});

describe('sigmoidNormalize', () => {
  it('should return 50 for score=0', () => {
    expect(sigmoidNormalize(0)).toBeCloseTo(50);
  });

  it('should approach 100 for large positive values', () => {
    const result = sigmoidNormalize(500);
    expect(result).toBeGreaterThan(99);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('should approach 0 for large negative values', () => {
    const result = sigmoidNormalize(-500);
    expect(result).toBeLessThan(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('should be monotonically increasing', () => {
    const values = [-100, -50, 0, 50, 100];
    const results = values.map((v) => sigmoidNormalize(v));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }
  });

  it('should respect custom scale parameter', () => {
    // Smaller scale = steeper curve = further from 50 for same input
    const smallScale = sigmoidNormalize(50, 10);
    const largeScale = sigmoidNormalize(50, 100);

    // With smaller scale, 50 is "larger" relative to scale, so closer to 100
    expect(smallScale).toBeGreaterThan(largeScale);
  });

  it('should always be between 0 and 100', () => {
    const testValues = [-1000, -100, -1, 0, 1, 100, 1000];
    for (const v of testValues) {
      const result = sigmoidNormalize(v);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    }
  });
});
