import {
  getDateRangeFilter,
  getDateRangeLabel,
  formatDate,
  getRelativeTime,
  parseDateFromTo,
  getDateFieldForSort,
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

    it('should return 3 months ago for "three_months"', () => {
      const result = getDateRangeFilter('three_months');
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
      expect(getDateRangeLabel('three_months')).toBe('過去3ヶ月');
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

  describe('parseDateFromTo', () => {
    it('parses valid dateFrom and dateTo', () => {
      const result = parseDateFromTo('2025-07-15', '2025-08-01');
      expect(result).not.toBeNull();
      expect(result!.from.getFullYear()).toBe(2025);
      expect(result!.from.getMonth()).toBe(6); // July = 6
      expect(result!.from.getDate()).toBe(15);
      expect(result!.to.getFullYear()).toBe(2025);
      expect(result!.to.getMonth()).toBe(7); // August = 7
      expect(result!.to.getDate()).toBe(1);
    });

    it('returns null for invalid dates', () => {
      expect(parseDateFromTo('invalid', '2025-08-01')).toBeNull();
      expect(parseDateFromTo('2025-07-15', 'invalid')).toBeNull();
    });

    it('returns null if range exceeds 3 months', () => {
      expect(parseDateFromTo('2025-01-01', '2025-08-01')).toBeNull();
    });

    it('returns null if from is after to', () => {
      expect(parseDateFromTo('2025-08-15', '2025-07-01')).toBeNull();
    });

    it('sets from to start of day and to to end of day', () => {
      const result = parseDateFromTo('2025-07-15', '2025-08-01');
      expect(result!.from.getHours()).toBe(0);
      expect(result!.from.getMinutes()).toBe(0);
      expect(result!.from.getSeconds()).toBe(0);
      expect(result!.to.getHours()).toBe(23);
      expect(result!.to.getMinutes()).toBe(59);
      expect(result!.to.getSeconds()).toBe(59);
    });

    it('handles dateFrom only (dateTo defaults to now)', () => {
      const result = parseDateFromTo('2025-07-15', undefined);
      expect(result).not.toBeNull();
      expect(result!.from.getFullYear()).toBe(2025);
      expect(result!.from.getMonth()).toBe(6);
      expect(result!.from.getDate()).toBe(15);
    });

    it('handles dateTo only (dateFrom defaults to 92 days before dateTo)', () => {
      const result = parseDateFromTo(undefined, '2025-08-01');
      expect(result).not.toBeNull();
      // dateFrom defaults to 92 days before dateTo (fits within 93-day ms limit after time normalization)
      const expectedFrom = new Date(
        new Date(2025, 7, 1).getTime() - 92 * 24 * 60 * 60 * 1000
      );
      expect(result!.from.getFullYear()).toBe(expectedFrom.getFullYear());
      expect(result!.from.getMonth()).toBe(expectedFrom.getMonth());
      expect(result!.from.getDate()).toBe(expectedFrom.getDate());
      expect(result!.to.getFullYear()).toBe(2025);
      expect(result!.to.getMonth()).toBe(7);
      expect(result!.to.getDate()).toBe(1);
    });

    it('returns null when both are undefined', () => {
      expect(parseDateFromTo(undefined, undefined)).toBeNull();
    });

    it('returns null when both are null', () => {
      expect(parseDateFromTo(null, null)).toBeNull();
    });

    it('returns null for overflow dates like Feb 31', () => {
      expect(parseDateFromTo('2025-02-31', '2025-03-15')).toBeNull();
      expect(parseDateFromTo('2025-06-31', '2025-07-15')).toBeNull();
    });

    it('returns null for month overflow like month 13', () => {
      expect(parseDateFromTo('2025-13-01', '2025-08-01')).toBeNull();
    });

    it('allows 92-calendar-day range (within 93-day ms limit after time normalization)', () => {
      // 92 calendar days: from 00:00:00.000 to +92d 23:59:59.999 = ~93d, within limit
      const result = parseDateFromTo('2025-05-19', '2025-08-19');
      expect(result).not.toBeNull();
    });

    it('rejects 93-calendar-day range (exceeds 93-day ms limit after time normalization)', () => {
      // 93 calendar days: from 00:00:00.000 to +93d 23:59:59.999 > 93d limit
      const result = parseDateFromTo('2025-05-18', '2025-08-19');
      expect(result).toBeNull();
    });

    it('allows same-day range', () => {
      const result = parseDateFromTo('2025-08-01', '2025-08-01');
      expect(result).not.toBeNull();
      expect(result!.from.getDate()).toBe(1);
      expect(result!.to.getDate()).toBe(1);
    });
  });

  describe('getDateFieldForSort', () => {
    it('returns createdAt for createdAt sort', () => {
      expect(getDateFieldForSort('createdAt')).toBe('createdAt');
    });

    it('returns publishedAt for publishedAt sort', () => {
      expect(getDateFieldForSort('publishedAt')).toBe('publishedAt');
    });

    it('returns publishedAt for non-date sort fields', () => {
      expect(getDateFieldForSort('qualityScore')).toBe('publishedAt');
      expect(getDateFieldForSort('bookmarks')).toBe('publishedAt');
      expect(getDateFieldForSort(undefined)).toBe('publishedAt');
    });
  });

  describe('DATE_RANGE_OPTIONS', () => {
    it('should have all expected options', () => {
      expect(DATE_RANGE_OPTIONS).toHaveLength(5);
      expect(DATE_RANGE_OPTIONS[0]).toEqual({ value: 'all', label: '全期間' });
      expect(DATE_RANGE_OPTIONS[1]).toEqual({ value: 'today', label: '今日' });
      expect(DATE_RANGE_OPTIONS[2]).toEqual({ value: 'week', label: '今週' });
      expect(DATE_RANGE_OPTIONS[3]).toEqual({ value: 'month', label: '今月' });
      expect(DATE_RANGE_OPTIONS[4]).toEqual({ value: 'three_months', label: '過去3ヶ月' });
    });
  });
});