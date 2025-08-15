import { parseUnifiedResponse } from '../../../lib/ai/unified-summary-parser';

// cleanupDetailedSummary関数をテストするためにexportする必要があるため、
// 実際のテストは統合的に実施
describe('unified-summary-parser', () => {
  describe('parseUnifiedResponse with markdown bold removal', () => {
    it('should remove markdown bold syntax from detailed summary', () => {
      const input = `
要約: テスト記事の要約内容です。

詳細要約:
・**項目名1:** 詳細な内容1
・**項目名2:** 詳細な内容2

タグ: テスト, Markdown, 要約
`;
      const result = parseUnifiedResponse(input);
      
      expect(result.detailedSummary).not.toContain('**');
      expect(result.detailedSummary).toContain('・項目名1:');
      expect(result.detailedSummary).toContain('・項目名2:');
    });
    
    it('should handle multiple markdown bold patterns in one line', () => {
      const input = `
要約: テスト要約

詳細要約:
・**重要な点:** これは**強調**された内容です
・**別の項目:** 通常の内容

タグ: テスト
`;
      const result = parseUnifiedResponse(input);
      
      expect(result.detailedSummary).not.toContain('**');
      expect(result.detailedSummary).toContain('・重要な点:');
      expect(result.detailedSummary).toContain('強調');
    });
    
    it('should preserve normal detailed summary without markdown', () => {
      const input = `
要約: テスト要約

詳細要約:
・通常の項目1：詳細な内容1
・通常の項目2：詳細な内容2

タグ: テスト
`;
      const result = parseUnifiedResponse(input);
      
      expect(result.detailedSummary).toContain('・通常の項目1：');
      expect(result.detailedSummary).toContain('・通常の項目2：');
    });
    
    it('should handle mixed markdown and normal content', () => {
      const input = `
要約: テスト要約

詳細要約:
・**Markdown項目:** 内容1
・通常の項目：内容2
・**別のMarkdown:** 内容3

タグ: テスト
`;
      const result = parseUnifiedResponse(input);
      
      expect(result.detailedSummary).not.toContain('**');
      expect(result.detailedSummary).toContain('・Markdown項目:');
      expect(result.detailedSummary).toContain('・通常の項目：');
      expect(result.detailedSummary).toContain('・別のMarkdown:');
    });
    
    it('should handle edge cases with asterisks', () => {
      const input = `
要約: テスト要約

詳細要約:
・**項目名:** 内容に*アスタリスク*が含まれる場合
・**別の項目:** 2 * 3 = 6 のような計算式

タグ: テスト
`;
      const result = parseUnifiedResponse(input);
      
      // 太字記法のみ削除、単独のアスタリスクは保持
      expect(result.detailedSummary).not.toContain('**項目名:**');
      expect(result.detailedSummary).toContain('・項目名:');
      expect(result.detailedSummary).toContain('*アスタリスク*');
      expect(result.detailedSummary).toContain('2 * 3 = 6');
    });
  });
  
  describe('parseUnifiedResponse general functionality', () => {
    it('should parse all sections correctly', () => {
      const input = `
要約: これはテスト記事の要約です。

詳細要約:
・項目1：詳細内容1
・項目2：詳細内容2

タグ: TypeScript, React, Testing
`;
      const result = parseUnifiedResponse(input);
      
      expect(result.summary).toBe('これはテスト記事の要約です。');
      expect(result.detailedSummary).toContain('・項目1：');
      expect(result.detailedSummary).toContain('・項目2：');
      expect(result.tags).toEqual(['TypeScript', 'React', 'Testing']);
    });
  });
});