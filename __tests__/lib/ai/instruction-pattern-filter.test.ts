import { INSTRUCTION_PATTERNS } from '@/lib/ai/constants';

describe('INSTRUCTION_PATTERNS', () => {
  describe('should detect all instruction markers', () => {
    const instructionLines = [
      '【条件】195文字',
      '【書き方】簡潔に',
      '【文末】句点で終わる',
      '【重要】必ず',
      '【システム指示】',
      '【指示】',
      '【記事文字数要件】',
      'DO NOT OUTPUT this',
      'INTERNAL METADATA',
      'Article content length: 5000',
      'Summary requirements: 150-250 chars',
      'IMPORTANT: The above metadata',
      '- 記事の核心的な内容を抽出',
      '- 技術的価値を明確に',
      '- 冗長な表現を避ける',
      '- 技術用語は略称で',
      'ここに要約を書く',
      '- 5000文字以上の記事',
      '[ここに要約]',
      '- 文字数: 150-250',
      '- JavaScript→JS',
      '  【条件】空白あり',
    ];

    instructionLines.forEach((line) => {
      it(`should match instruction line: "${line.substring(0, 40)}..."`, () => {
        const trimmedLine = line.trim();
        const matches = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine));
        expect(matches).toBe(true);
      });
    });
  });

  describe('should NOT filter valid summary lines', () => {
    const validLines = [
      '・技術概要：Next.js 15の新機能を解説',
      '・実装手順：TypeScriptでの型定義方法',
      '記事は新しいReactの機能を解説。',
      'Next.js 15のApp Routerについて詳しく説明する。',
      '・背景：従来のPages Routerの課題',
      '本記事では、最新のフロントエンド技術を紹介する。',
      '- React 19の新機能',
      '- Server Componentsの活用方法',
    ];

    validLines.forEach((line) => {
      it(`should NOT match valid summary line: "${line.substring(0, 40)}..."`, () => {
        const trimmedLine = line.trim();
        const matches = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine));
        expect(matches).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const matches = INSTRUCTION_PATTERNS.some(pattern => pattern.test(''));
      expect(matches).toBe(false);
    });

    it('should handle whitespace-only string', () => {
      const trimmedLine = '   '.trim();
      const matches = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine));
      expect(matches).toBe(false);
    });

    it('should detect instruction with leading whitespace after trim', () => {
      const line = '  【条件】195文字';
      const trimmedLine = line.trim();
      const matches = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine));
      expect(matches).toBe(true);
    });
  });
});
