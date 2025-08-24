import { formatDate, parseRSSDate } from '@/lib/utils/date';

describe('date utils', () => {
  describe('formatDate', () => {
    beforeEach(() => {
      // テスト用の現在時刻を固定
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should format date as seconds ago for recent times', () => {
      const date = new Date('2025-01-15T11:59:30.000Z'); // 30秒前
      expect(formatDate(date)).toBe('30秒前');
    });

    it('should format date as minutes ago for times less than an hour', () => {
      const date = new Date('2025-01-15T11:45:00.000Z'); // 15分前
      expect(formatDate(date)).toBe('15分前');
    });

    it('should format date as hours ago for times less than a day', () => {
      const date = new Date('2025-01-15T09:00:00.000Z'); // 3時間前
      expect(formatDate(date)).toBe('3時間前');
    });

    it('should format date as days ago for times less than a week', () => {
      const date = new Date('2025-01-13T12:00:00.000Z'); // 2日前
      expect(formatDate(date)).toBe('2日前');
    });

    it('should format date as YYYY/MM/DD for dates older than a week', () => {
      const date = new Date('2025-01-01T12:00:00.000Z'); // 14日前
      expect(formatDate(date)).toBe('2025/01/01');
    });

    it('should handle string dates', () => {
      const dateString = '2025-01-15T11:00:00.000Z'; // 1時間前
      expect(formatDate(dateString)).toBe('1時間前');
    });

    it('should handle edge case of exactly 1 minute', () => {
      const date = new Date('2025-01-15T11:59:00.000Z'); // 1分前
      expect(formatDate(date)).toBe('1分前');
    });

    it('should handle edge case of exactly 1 hour', () => {
      const date = new Date('2025-01-15T11:00:00.000Z'); // 1時間前
      expect(formatDate(date)).toBe('1時間前');
    });

    it('should handle edge case of exactly 1 day', () => {
      const date = new Date('2025-01-14T12:00:00.000Z'); // 1日前
      expect(formatDate(date)).toBe('1日前');
    });

    it('should handle edge case of exactly 7 days', () => {
      const date = new Date('2025-01-08T12:00:00.000Z'); // 7日前
      expect(formatDate(date)).toBe('2025/01/08');
    });

    it('should handle very old dates', () => {
      const date = new Date('2020-01-01T00:00:00.000Z');
      expect(formatDate(date)).toBe('2020/01/01');
    });
  });

  describe('parseRSSDate', () => {
    // console文削除に伴い、モック設定も削除

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should parse valid ISO date string', () => {
      const date = parseRSSDate('2025-01-15T10:00:00.000Z');
      expect(date).toEqual(new Date('2025-01-15T10:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should parse RFC 2822 date format', () => {
      const date = parseRSSDate('Wed, 15 Jan 2025 10:00:00 GMT');
      expect(date).toEqual(new Date('2025-01-15T10:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should parse simple date format', () => {
      const date = parseRSSDate('2025-01-15');
      expect(date.toISOString().startsWith('2025-01-15')).toBe(true);
      // console.warnテストは削除: expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should return current date for invalid date string', () => {
      const date = parseRSSDate('invalid date');
      expect(date).toEqual(new Date('2025-01-15T12:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).toHaveBeenCalledWith('Invalid date format: invalid date');
    });

    it('should return current date for empty string', () => {
      const date = parseRSSDate('');
      expect(date).toEqual(new Date('2025-01-15T12:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).toHaveBeenCalledWith('Invalid date format: ');
    });

    it('should return current date for future date (more than 1 year)', () => {
      const futureDate = '2027-01-15T10:00:00.000Z';
      const date = parseRSSDate(futureDate);
      expect(date).toEqual(new Date('2025-01-15T12:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Future date detected')
      );
    });

    it('should accept dates within 1 year in the future', () => {
      const nearFutureDate = '2025-12-31T10:00:00.000Z';
      const date = parseRSSDate(nearFutureDate);
      expect(date).toEqual(new Date('2025-12-31T10:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should return current date for abnormally large timestamp', () => {
      const largeTimestamp = '99999999999999';
      const date = parseRSSDate(largeTimestamp);
      expect(date).toEqual(new Date('2025-01-15T12:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid date format')
      );
    });

    it('should handle numeric timestamp as invalid string', () => {
      const normalTimestamp = '1736942400000'; // Will be treated as invalid
      const date = parseRSSDate(normalTimestamp);
      expect(date).toEqual(new Date('2025-01-15T12:00:00.000Z'));
      // console.warnテストは削除: expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid date format')
      );
    });

    it('should handle ISO date with milliseconds timestamp', () => {
      const isoDate = '2025-01-15T10:00:00.123Z';
      const date = parseRSSDate(isoDate);
      expect(date).toEqual(new Date('2025-01-15T10:00:00.123Z'));
      // console.warnテストは削除: expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle various date formats', () => {
      const formats = [
        '2025/01/15',
        '15-Jan-2025',
        'January 15, 2025',
        '2025.01.15',
      ];

      formats.forEach(format => {
        const date = parseRSSDate(format);
        expect(date.getFullYear()).toBe(2025);
        expect(date.getMonth()).toBe(0); // January
        expect(date.getDate()).toBe(15);
      });
    });
  });
});