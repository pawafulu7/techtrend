/**
 * 手動経路（GeminiClient）の要約の後処理が、要約生成と同じ上限で切り詰めることを検証する（issue #655 項目 1）
 */

import { postProcessSummary } from '@/lib/ai/summary-generator';
import { SUMMARY_LENGTH } from '@/lib/ai/constants';

describe('postProcessSummary の既定の上限', () => {
  const sentence = 'あ'.repeat(99) + '。'; // 100 字

  it('要約生成の目標帯（150-250 字）の要約を切り詰めない', () => {
    const summary = sentence.repeat(2); // 200 字
    expect(postProcessSummary(summary)).toBe(summary);
  });

  it(`${SUMMARY_LENGTH.hardMax} 字を超える要約は文の区切りで切り詰める`, () => {
    expect(postProcessSummary(sentence.repeat(3))).toBe(sentence.repeat(2));
  });
});
