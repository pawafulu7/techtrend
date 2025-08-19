import {
  getDateRangeFilter,
  getDateRangeLabel,
  formatDate,
  getRelativeTime,
  DATE_RANGE_OPTIONS,
} from '@/app/lib/date-utils';

describe('Date Utils', () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-08-19T12:00:00Z'));
  });

  describe('getDateRangeFilter', () => {
    it('should return today\'s start date for "today"', () => {
      const result = getDateRangeFilter('today');
      expect(result).toBeInstanceOf(Date);
      // Check that it's the start of today (hours, minutes, seconds are 0)
      expect(result?.getHours()).toBe(0);
      expect(result?.getMinutes()).toBe(0);
      expect(result?.getSeconds()).toBe(0);
      expect(result?.getMilliseconds()).toBe(0);
    });

    it('should return 7 days ago for "week"', () => {
      const result = getDateRangeFilter('week');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2025-08-12T12:00:00.000Z');
    });

    it('should return 1 month ago for "month"', () => {
      const result = getDateRangeFilter('month');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2025-07-19T12:00:00.000Z');
    });

    it('should return 3 months ago for "3months"', () => {
      const result = getDateRangeFilter('3months');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2025-05-19T12:00:00.000Z');
    });

    it('should return null for "all"', () => {
      const result = getDateRangeFilter('all');
      expect(result).toBeNull();
    });

    it('should return null for invalid range', () => {
      const result = getDateRangeFilter('invalid');
      expect(result).toBeNull();
    });
  });

  describe('getDateRangeLabel', () => {
    it('should return correct labels for valid options', () => {
      expect(getDateRangeLabel('all')).toBe('全期間');
      expect(getDateRangeLabel('today')).toBe('今日');
      expect(getDateRangeLabel('week')).toBe('今週');
      expect(getDateRangeLabel('month')).toBe('今月');
      expect(getDateRangeLabel('3months')).toBe('過去3ヶ月');
    });

    it('should return "全期間" for invalid value', () => {
      expect(getDateRangeLabel('invalid')).toBe('全期間');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2025-08-19T15:30:45Z');
      const formatted = formatDate(date);
      // Check that the format is YYYY-MM-DD
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Check that it contains the year
      expect(formatted).toContain('2025');
    });

    it('should pad single digit months and days', () => {
      const date = new Date('2025-01-05T10:00:00Z');
      expect(formatDate(date)).toBe('2025-01-05');
    });
  });

  describe('getRelativeTime', () => {
    it('should return "たった今" for very recent dates', () => {
      const now = new Date('2025-08-19T12:00:00Z');
      expect(getRelativeTime(now)).toBe('たった今');
    });

    it('should return minutes for recent dates', () => {
      const date = new Date('2025-08-19T11:30:00Z');
      expect(getRelativeTime(date)).toBe('30分前');
    });

    it('should return hours for same day', () => {
      const date = new Date('2025-08-19T09:00:00Z');
      expect(getRelativeTime(date)).toBe('3時間前');
    });

    it('should return "昨日" for yesterday', () => {
      const date = new Date('2025-08-18T12:00:00Z');
      expect(getRelativeTime(date)).toBe('昨日');
    });

    it('should return days for recent days', () => {
      const date = new Date('2025-08-16T12:00:00Z');
      expect(getRelativeTime(date)).toBe('3日前');
    });

    it('should return weeks for recent weeks', () => {
      const date = new Date('2025-08-05T12:00:00Z');
      expect(getRelativeTime(date)).toBe('2週間前');
    });

    it('should return months for recent months', () => {
      const date = new Date('2025-06-19T12:00:00Z');
      expect(getRelativeTime(date)).toBe('2ヶ月前');
    });

    it('should return years for old dates', () => {
      const date = new Date('2023-08-19T12:00:00Z');
      expect(getRelativeTime(date)).toBe('2年前');
    });
  });

  describe('DATE_RANGE_OPTIONS', () => {
    it('should have all expected options', () => {
      expect(DATE_RANGE_OPTIONS).toHaveLength(5);
      expect(DATE_RANGE_OPTIONS[0]).toEqual({ value: 'all', label: '全期間' });
      expect(DATE_RANGE_OPTIONS[1]).toEqual({ value: 'today', label: '今日' });
      expect(DATE_RANGE_OPTIONS[2]).toEqual({ value: 'week', label: '今週' });
      expect(DATE_RANGE_OPTIONS[3]).toEqual({ value: 'month', label: '今月' });
      expect(DATE_RANGE_OPTIONS[4]).toEqual({ value: '3months', label: '過去3ヶ月' });
    });
  });
});