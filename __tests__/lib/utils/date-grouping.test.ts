import {
  groupHistoryByDate,
  DATE_GROUP_LABELS,
  getDateGroupHeadingId,
  type DateGroupKey,
} from '@/lib/utils/date-grouping';

describe('date-grouping utility', () => {
  // Fixed reference date for consistent testing
  const fixedNow = new Date('2025-12-14T15:00:00.000Z');

  describe('groupHistoryByDate', () => {
    it('should return empty array for empty input', () => {
      const result = groupHistoryByDate([], { now: fixedNow });
      expect(result).toEqual([]);
    });

    it('should group items viewed today', () => {
      const views = [
        { viewedAt: '2025-12-14T10:00:00.000Z' },
        { viewedAt: '2025-12-14T08:00:00.000Z' },
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('today');
      expect(result[0].label).toBe('今日');
      expect(result[0].items).toHaveLength(2);
    });

    it('should group items viewed yesterday', () => {
      const views = [
        { viewedAt: '2025-12-13T20:00:00.000Z' },
        { viewedAt: '2025-12-13T08:00:00.000Z' },
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('yesterday');
      expect(result[0].label).toBe('昨日');
      expect(result[0].items).toHaveLength(2);
    });

    it('should group items viewed this week (excluding today and yesterday)', () => {
      // Dec 14, 2025 is a Sunday, so "this week" (starting Monday) includes Dec 8-14
      const views = [
        { viewedAt: '2025-12-10T10:00:00.000Z' }, // Wednesday
        { viewedAt: '2025-12-09T10:00:00.000Z' }, // Tuesday
      ];
      const result = groupHistoryByDate(views, { now: fixedNow, weekStartsOn: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('thisWeek');
      expect(result[0].label).toBe('今週');
      expect(result[0].items).toHaveLength(2);
    });

    it('should group items viewed earlier than this week', () => {
      const views = [
        { viewedAt: '2025-12-01T10:00:00.000Z' },
        { viewedAt: '2025-11-25T10:00:00.000Z' },
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('earlier');
      expect(result[0].label).toBe('それ以前');
      expect(result[0].items).toHaveLength(2);
    });

    it('should sort groups in correct order: today -> yesterday -> thisWeek -> earlier', () => {
      const views = [
        { viewedAt: '2025-11-01T10:00:00.000Z' }, // earlier
        { viewedAt: '2025-12-14T10:00:00.000Z' }, // today
        { viewedAt: '2025-12-10T10:00:00.000Z' }, // this week
        { viewedAt: '2025-12-13T10:00:00.000Z' }, // yesterday
      ];
      const result = groupHistoryByDate(views, { now: fixedNow, weekStartsOn: 1 });

      expect(result).toHaveLength(4);
      expect(result[0].key).toBe('today');
      expect(result[1].key).toBe('yesterday');
      expect(result[2].key).toBe('thisWeek');
      expect(result[3].key).toBe('earlier');
    });

    it('should sort items within each group by viewedAt descending', () => {
      const views = [
        { viewedAt: '2025-12-14T08:00:00.000Z' },
        { viewedAt: '2025-12-14T12:00:00.000Z' },
        { viewedAt: '2025-12-14T10:00:00.000Z' },
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result[0].items[0].viewedAt).toBe('2025-12-14T12:00:00.000Z');
      expect(result[0].items[1].viewedAt).toBe('2025-12-14T10:00:00.000Z');
      expect(result[0].items[2].viewedAt).toBe('2025-12-14T08:00:00.000Z');
    });

    it('should not include empty groups', () => {
      const views = [
        { viewedAt: '2025-12-14T10:00:00.000Z' }, // today only
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('today');
    });

    it('should handle week boundary correctly with weekStartsOn option', () => {
      // Dec 14, 2025 is Sunday
      // With weekStartsOn: 0 (Sunday), this week starts Dec 14
      // With weekStartsOn: 1 (Monday), this week starts Dec 8
      const views = [
        { viewedAt: '2025-12-08T10:00:00.000Z' }, // Monday of current week
      ];

      // Monday start - Dec 8 is in this week
      const resultMondayStart = groupHistoryByDate(views, { now: fixedNow, weekStartsOn: 1 });
      expect(resultMondayStart[0].key).toBe('thisWeek');

      // Sunday start - Dec 8 is in previous week (earlier)
      const resultSundayStart = groupHistoryByDate(views, { now: fixedNow, weekStartsOn: 0 });
      expect(resultSundayStart[0].key).toBe('earlier');
    });

    it('should preserve additional item properties', () => {
      const views = [
        { viewedAt: '2025-12-14T10:00:00.000Z', customProp: 'test' },
      ];
      const result = groupHistoryByDate(views, { now: fixedNow });

      expect(result[0].items[0]).toHaveProperty('customProp', 'test');
    });
  });

  describe('DATE_GROUP_LABELS', () => {
    it('should have correct Japanese labels for all group keys', () => {
      expect(DATE_GROUP_LABELS.today).toBe('今日');
      expect(DATE_GROUP_LABELS.yesterday).toBe('昨日');
      expect(DATE_GROUP_LABELS.thisWeek).toBe('今週');
      expect(DATE_GROUP_LABELS.earlier).toBe('それ以前');
    });
  });

  describe('getDateGroupHeadingId', () => {
    it('should generate correct heading IDs for each group', () => {
      expect(getDateGroupHeadingId('today')).toBe('history-group-today-heading');
      expect(getDateGroupHeadingId('yesterday')).toBe('history-group-yesterday-heading');
      expect(getDateGroupHeadingId('thisWeek')).toBe('history-group-thisWeek-heading');
      expect(getDateGroupHeadingId('earlier')).toBe('history-group-earlier-heading');
    });
  });
});
