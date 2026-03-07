import { postProcessSummaries } from '@/lib/utils/summary/summary-post-processor';

describe('postProcessSummaries', () => {
  it('normalizes malformed detailed summaries with colon + newline patterns and multiple bullet items', () => {
    const summary = '元のサマリーは変更しない';
    const detailed = `
・概要:     
    複数行に分割された説明。

・効果:
    処理後に結合される項目。
・メモ: 既に一行で提供。
`;

    const result = postProcessSummaries(summary, detailed);

    expect(result.detailedSummary).toBe(
      ['・概要: 複数行に分割された説明', '・効果: 処理後に結合される項目', '・メモ: 既に一行で提供'].join('\n'),
    );
    expect(result.summary).toBe(summary);
  });

  it('keeps already well-formatted single-line bullet items intact', () => {
    const summary = '保持されるサマリー';
    const detailed = ['・概要: 既に整形済み', '・影響: そのまま残す'].join('\n');

    const result = postProcessSummaries(summary, detailed);

    expect(result.detailedSummary).toBe(detailed);
    expect(result.summary).toBe(summary);
  });

  it('removes trailing periods from bullet items', () => {
    const detailed = ['・項目: 文末に句点。', '・別項目: 二つ目の説明。'].join('\n');

    const result = postProcessSummaries('サマリー', detailed);

    expect(result.detailedSummary).toBe(['・項目: 文末に句点', '・別項目: 二つ目の説明'].join('\n'));
  });

  it('returns summary unchanged even when detailed summary is modified', () => {
    const summary = 'オリジナルのサマリー';
    const detailed = '・修正対象: 末尾に句点。';

    const result = postProcessSummaries(summary, detailed);

    expect(result.summary).toBe(summary);
    expect(result.detailedSummary).toBe('・修正対象: 末尾に句点');
  });
});
