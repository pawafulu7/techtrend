import {
  sanitizeTrendAiText,
  stripInternalArticleRefs,
} from '@/lib/utils/trend-ai-text';
import {
  resolveRefKeysToIds,
  validateV2Content,
} from '@/lib/services/trend-report/trend-ai-validators';

describe('デイリーレポートの内部参照', () => {
  it.each([
    ['【A7、A8】', ''],
    ['（A7，A8)', ''],
    ['(A7・A8）', ''],
    ['[ A7, A8、A9，A10・A11 ]', ''],
    ['Foo (A7) bar', 'Foo bar'],
    ['発表\n (A7) 続き', '発表\n 続き'],
    ['AWS（東京）', 'AWS（東京）'],
    ['製品（AB7）', '製品（AB7）'],
    ['説明[A7 spec]', '説明[A7 spec]'],
    ['説明(A7; A8)', '説明(A7; A8)'],
  ])('本文 %s の参照表記を処理し、参照以外と改行を保つ', (text, expected) => {
    const cleaned = sanitizeTrendAiText({
      core: text,
      evidenceArticleIds: ['A7'],
    });
    expect(cleaned.core).toBe(expected);
    expect(cleaned.evidenceArticleIds).toEqual(['A7']);
  });

  it('本文から参照表記だけを除き、製品名や通常の括弧は保持する', () => {
    expect(
      stripInternalArticleRefs(
        '発表（A7）と更新(A8, A9)[A10]。AWS（東京）とA7製品。'
      )
    ).toBe('発表と更新。AWS（東京）とA7製品。');
  });

  it('入れ子の本文と旧レポートの本文を処理し、記事リンクの配列を保持する', () => {
    const original = {
      version: 'trend_ai_summary_v2',
      core: '発表（A7）',
      keyTopics: [
        {
          topic: 'AI',
          whatHappened: '更新（A8）',
          whyItMatters: '設計に影響(A7)',
          evidenceArticleIds: ['A7'],
        },
      ],
      actions: [
        { action: '試す(A8)', reason: '確認する（A7）', articleIds: ['A8'] },
      ],
    };
    const cleaned = sanitizeTrendAiText(original);
    resolveRefKeysToIds(
      cleaned,
      new Map([
        ['A7', 'article-7'],
        ['A8', 'article-8'],
      ]),
      undefined
    );
    expect(validateV2Content(cleaned)).toEqual([]);
    expect(cleaned.core).toBe('発表');
    expect(cleaned.keyTopics[0].evidenceArticleIds).toEqual(['article-7']);
    expect(cleaned.actions[0].articleIds).toEqual(['article-8']);
    expect(original.core).toBe('発表（A7）');
    expect(
      sanitizeTrendAiText({ headline: '旧レポート（A1）', notes: ['補足(A2)'] })
    ).toEqual({ headline: '旧レポート', notes: ['補足'] });
  });
});
