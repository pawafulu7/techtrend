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
      expect(result.detailedSummary).toContain('・項目名1：');
      expect(result.detailedSummary).toContain('・項目名2：');
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
      expect(result.detailedSummary).toContain('・重要な点：');
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
      expect(result.detailedSummary).toContain('・Markdown項目：');
      expect(result.detailedSummary).toContain('・通常の項目：');
      expect(result.detailedSummary).toContain('・別のMarkdown：');
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
      expect(result.detailedSummary).toContain('・項目名：');
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

  describe('parseUnifiedResponse - category removal and format normalization', () => {
    it('should convert category:title format to title-only format', () => {
      const input = `
詳細要約:
・技術概要：GPSの進化と位置情報共有の普及
GPS（Global Positioning System）は、元々軍事利用を目的に開発されたが、その正確性から民間利用も拡大し、現代社会に不可欠な技術となった
・背景：位置情報共有のメリットとデメリット
位置情報共有は、家族や友人との連絡を円滑にし、安全確認に役立つ
`;
      const result = parseUnifiedResponse(input);

      const lines = result.detailedSummary.split('\n');
      expect(lines[0]).toBe('・GPSの進化と位置情報共有の普及：GPS（Global Positioning System）は、元々軍事利用を目的に開発されたが、その正確性から民間利用も拡大し、現代社会に不可欠な技術となった');
      expect(lines[0]).not.toContain('技術概要');
      expect(lines[1]).toBe('・位置情報共有のメリットとデメリット：位置情報共有は、家族や友人との連絡を円滑にし、安全確認に役立つ');
      expect(lines[1]).not.toContain('背景');
    });

    it('should preserve category if secondPart is long content', () => {
      const input = `
詳細要約:
・技術概要：GPS（Global Positioning System）は元々軍事利用を目的に開発されたが、その正確性から民間利用も拡大し、現代社会に不可欠な技術となった
`;
      const result = parseUnifiedResponse(input);

      expect(result.detailedSummary).toContain('・技術概要：');
      expect(result.detailedSummary).toContain('GPS（Global Positioning System）');
    });

    it('should filter out instruction lines from summary', () => {
      const input = `
要約: 【条件】180文字
位置情報共有は、現代社会における人間関係に複雑な影響を与えている
`;
      const result = parseUnifiedResponse(input);

      expect(result.summary).not.toContain('【条件】');
      expect(result.summary).toContain('位置情報共有');
    });

    it('should filter out instruction lines from detailed summary', () => {
      const input = `
詳細要約:
【重要：以下の文字数を必ず守ること】
- 5000文字以上の記事：必ず800文字以上1500文字以内で作成
・Toyboxの概要：Toyboxは、Linuxコマンドラインユーティリティを単一の実行ファイルにまとめたプロジェクトである
`;
      const result = parseUnifiedResponse(input);

      expect(result.detailedSummary).not.toContain('【重要');
      expect(result.detailedSummary).not.toContain('5000文字以上');
      expect(result.detailedSummary).toContain('・Toyboxの概要：');
    });

    it('should handle items without category prefix', () => {
      const input = `
詳細要約:
・CASALの技術的詳細：CASALは、LLMのハルシネーションを抑制するための新しいアプローチである
`;
      const result = parseUnifiedResponse(input);

      expect(result.detailedSummary).toBe('・CASALの技術的詳細：CASALは、LLMのハルシネーションを抑制するための新しいアプローチである');
    });

    it('should add period when concatenating continuation lines', () => {
      const input = `
詳細要約:
・項目名：最初の文
2番目の文
`;
      const result = parseUnifiedResponse(input);

      expect(result.detailedSummary).toContain('。2番目の文');
    });

    it('should not add period if line already ends with punctuation', () => {
      const input = `
詳細要約:
・項目名：最初の文。
2番目の文
`;
      const result = parseUnifiedResponse(input);

      expect(result.detailedSummary).not.toContain('。。');
      expect(result.detailedSummary).toContain('。2番目の文');
    });

    it('should handle asterisk bullets correctly', () => {
      const input = `
詳細要約:
*技術概要：Asterisk箇条書きのテスト
本文が続きます
*通常の項目：内容がここに入ります
`;
      const result = parseUnifiedResponse(input);

      const lines = result.detailedSummary.split('\n');
      expect(lines[0]).toBe('・Asterisk箇条書きのテスト：本文が続きます');
      expect(lines[1]).toBe('・通常の項目：内容がここに入ります');
    });

    it('should not treat instruction line as continuation', () => {
      const input = `
詳細要約:
・技術概要：項目タイトル
【重要：以下は指示行です】
・次の項目：これは別の項目です
`;
      const result = parseUnifiedResponse(input);

      const lines = result.detailedSummary.split('\n');
      // 次行が指示行の場合、hasContinuation = false となり、カテゴリ削除されない
      expect(lines[0]).toBe('・技術概要：項目タイトル');
      expect(lines[0]).not.toContain('【重要');
      expect(lines[1]).toBe('・次の項目：これは別の項目です');
    });

    it('should not add period after exclamation or question marks', () => {
      const input = `
詳細要約:
・項目名：これは重要な発見です！
次の文章が続きます
・別の項目：本当にそうなのか？
確認が必要です
`;
      const result = parseUnifiedResponse(input);

      const lines = result.detailedSummary.split('\n');
      expect(lines[0]).toBe('・項目名：これは重要な発見です！次の文章が続きます');
      expect(lines[0]).not.toContain('！。');
      expect(lines[1]).toBe('・別の項目：本当にそうなのか？確認が必要です');
      expect(lines[1]).not.toContain('？。');
    });

    it('should not add period after English punctuation', () => {
      const input = `
詳細要約:
・Technical overview：This is amazing!
Next sentence follows
・Another item：Is this correct?
We need to verify
`;
      const result = parseUnifiedResponse(input);

      const lines = result.detailedSummary.split('\n');
      expect(lines[0]).not.toContain('!。');
      expect(lines[1]).not.toContain('?。');
    });
  });
});