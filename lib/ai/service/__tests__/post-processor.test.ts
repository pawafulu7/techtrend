import { SummaryPostProcessor } from '../post-processor';

describe('SummaryPostProcessor', () => {
  let processor: SummaryPostProcessor;

  beforeEach(() => {
    processor = new SummaryPostProcessor();
  });

  describe('cleanupSummary', () => {
    it('should remove newlines from summary', () => {
      const input = 'This is a test\nsummary with\nmultiple lines.';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('This is a test summary with multiple lines.');
      expect(result).not.toContain('\n');
    });

    it('should normalize multiple spaces to single space', () => {
      const input = 'This   has    multiple     spaces.';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('This has multiple spaces.');
    });

    it('should remove consecutive periods', () => {
      const input = 'This is a test。。This has double periods。';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('This is a test。This has double periods。');
    });

    it('should remove consecutive commas', () => {
      const input = 'Item1、、Item2、、、Item3。';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('Item1、Item2、Item3。');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '   This has spaces   ';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('This has spaces');
    });

    it('should handle Japanese text correctly', () => {
      const input = 'この記事では\nTypeScriptの型システムについて\n詳しく解説しています。';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('この記事では TypeScriptの型システムについて 詳しく解説しています。');
    });

    it('should handle combined formatting issues', () => {
      const input = '  This  has\n\nmultiple\n\nissues。。With   formatting、、、  ';
      const result = processor.cleanupSummary(input);

      expect(result).toBe('This has multiple issues。With formatting、');
    });
  });

  describe('cleanupDetailedSummary', () => {
    it('should preserve newlines between bullet points', () => {
      const input = '・Item 1\n・Item 2\n・Item 3';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1\n・Item 2\n・Item 3');
      expect(result.split('\n')).toHaveLength(3);
    });

    it('should remove empty bullet points', () => {
      const input = '・Item 1\n・\n・Item 2\n・';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1\n・Item 2');
      expect(result).not.toContain('・\n');
    });

    it('should remove empty lines', () => {
      const input = '・Item 1\n\n\n・Item 2\n\n・Item 3';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1\n・Item 2\n・Item 3');
    });

    it('should trim whitespace from each line', () => {
      const input = '  ・Item 1  \n   ・Item 2   \n・Item 3  ';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1\n・Item 2\n・Item 3');
    });

    it('should remove consecutive periods', () => {
      const input = '・Item 1。。\n・Item 2。。。';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1。\n・Item 2。');
    });

    it('should remove consecutive commas', () => {
      const input = '・Item 1、、説明\n・Item 2、、、詳細';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1、説明\n・Item 2、詳細');
    });

    it('should handle mixed Japanese and English content', () => {
      const input = '・概要：TypeScriptの基本\n・特徴：Type safety and flexibility\n・実践：実際のプロジェクト例';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・概要：TypeScriptの基本\n・特徴：Type safety and flexibility\n・実践：実際のプロジェクト例');
    });

    it('should handle complex formatting issues', () => {
      const input = '  ・Item 1。。  \n\n\n  ・  \n  ・Item 2、、、  \n\n  ・Item 3  ';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・Item 1。\n・Item 2、\n・Item 3');
    });

    it('should merge bullet headers with continuation lines', () => {
      const input = '・項目名：\n内容が次の行にある';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・項目名： 内容が次の行にある');
      expect(result).not.toMatch(/：\s*\n/);
    });

    it('should not affect normal bullets with content on same line', () => {
      const input = '・項目名： 内容が同じ行にある';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・項目名： 内容が同じ行にある');
    });

    it('should handle multiple bullets with newline issues', () => {
      const input = '・項目1：\n内容1\n・項目2： 正常な内容2\n・項目3：\n内容3が改行後';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・項目1： 内容1\n・項目2： 正常な内容2\n・項目3： 内容3が改行後');
      expect(result).not.toMatch(/：\s*\n[^・]/);
    });

    it('should not merge consecutive bullets', () => {
      const input = '・項目1：\n・項目2： 内容2';
      const result = processor.cleanupDetailedSummary(input);

      expect(result).toBe('・項目1：\n・項目2： 内容2');
    });
  });

  describe('formatTags', () => {
    it('should trim whitespace from tags', () => {
      const input = ['  tag1  ', ' tag2 ', 'tag3   '];
      const result = processor.formatTags(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should remove empty tags', () => {
      const input = ['tag1', '', '  ', 'tag2', 'tag3'];
      const result = processor.formatTags(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should remove duplicate tags', () => {
      const input = ['tag1', 'tag2', 'tag1', 'tag3', 'tag2'];
      const result = processor.formatTags(input);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should limit tags to maximum 10', () => {
      const input = Array.from({ length: 15 }, (_, i) => `tag${i + 1}`);
      const result = processor.formatTags(input);

      expect(result).toHaveLength(10);
      expect(result).toEqual(['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10']);
    });

    it('should handle mixed Japanese and English tags', () => {
      const input = ['TypeScript', '型システム', 'JavaScript', 'プログラミング'];
      const result = processor.formatTags(input);

      expect(result).toEqual(['TypeScript', '型システム', 'JavaScript', 'プログラミング']);
    });

    it('should handle all formatting issues combined', () => {
      const input = [
        '  tag1  ',
        'tag2',
        '',
        '  tag1  ',
        'tag3',
        '  ',
        'tag2',
        'tag4',
        'tag5',
        'tag6',
        'tag7',
        'tag8',
        'tag9',
        'tag10',
        'tag11',
        'tag12',
      ];
      const result = processor.formatTags(input);

      expect(result).toHaveLength(10);
      expect(result).toEqual(['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10']);
    });

    it('should preserve tag order', () => {
      const input = ['zebra', 'apple', 'banana'];
      const result = processor.formatTags(input);

      expect(result).toEqual(['zebra', 'apple', 'banana']);
    });

    it('should handle empty input array', () => {
      const input: string[] = [];
      const result = processor.formatTags(input);

      expect(result).toEqual([]);
    });
  });
});