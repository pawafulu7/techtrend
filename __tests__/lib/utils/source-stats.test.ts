import { calculateGrowthRateFromStats } from '@/lib/utils/source-stats';

describe('calculateGrowthRateFromStats', () => {
  it('should return 0 for undefined stats', () => {
    expect(calculateGrowthRateFromStats(undefined)).toBe(0);
  });

  it('should return 100 for recent articles only (no past)', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 10,
      past_month_articles: 0
    })).toBe(100);
  });

  it('should return -100 for past articles only (no recent)', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 0,
      past_month_articles: 10
    })).toBe(-100);
  });

  it('should return 0 for no articles', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 0,
      past_month_articles: 0
    })).toBe(0);
  });

  it('should calculate positive growth rate', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 15,
      past_month_articles: 10
    })).toBe(50);
  });

  it('should calculate negative growth rate', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 5,
      past_month_articles: 10
    })).toBe(-50);
  });

  it('should calculate 0% growth for equal counts', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 10,
      past_month_articles: 10
    })).toBe(0);
  });

  it('should round to nearest integer', () => {
    expect(calculateGrowthRateFromStats({
      recent_articles: 7,
      past_month_articles: 5
    })).toBe(40); // (7-5)/5 * 100 = 40
  });
});
