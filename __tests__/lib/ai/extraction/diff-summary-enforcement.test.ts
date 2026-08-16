import { diffSummaryConfig } from '@/lib/ai/extraction/prompts/diff-summary-prompt';
import type { DiffSummaryInput } from '@/lib/ai/extraction/prompts/diff-summary-prompt';

/**
 * コード側で算出した分類結果が、LLM 応答によって覆されないことを検証する。
 *
 * プロンプトで「type を再判定しないこと」と指示するだけでは保証にならない。
 * parseResponse が入力を受け取り、topic / type / unchanged を機械的に確定させる。
 */

function makeInput(): DiffSummaryInput {
  return {
    category: 'ai',
    categoryName: 'AI',
    currentPeriod: '2026-W02',
    baselinePeriod: '2026-W01',
    currentTopics: [
      { topic: 'RAG', count: 8, articleIds: ['a1'], headlines: ['h1'] },
      { topic: 'Python', count: 6, articleIds: ['a2'], headlines: ['h2'] },
    ],
    baselineTopics: [
      { topic: 'jQuery', count: 10, articleIds: ['a3'], headlines: ['h3'] },
      { topic: 'Python', count: 5, articleIds: ['a4'], headlines: ['h4'] },
    ],
  };
}

function llmResponse(changes: unknown[]): string {
  return JSON.stringify({
    changes,
    unchanged: ['LLMが勝手に書いた値'],
    summary: 'あ'.repeat(60),
    keyTakeaways: ['要点'],
  });
}

const validDescription = '0→8件。検索拡張生成が実用段階に到達し採用が進む';

describe('parseDiffSummaryResponse による分類強制', () => {
  const parse = (text: string) =>
    diffSummaryConfig.parseResponse(text, makeInput());

  it('LLM が type を書き換えてもコード側の分類が優先される', () => {
    const out = parse(
      llmResponse([
        {
          type: 'trending', // 本来 new
          topic: 'RAG',
          description: validDescription,
          significance: 'high',
        },
        {
          type: 'trending', // 本来 deprecated
          topic: 'jQuery',
          description: '10→0件。移行が完了し新規採用が消滅',
          significance: 'low',
        },
      ])
    );

    expect(out.changes.find((c) => c.topic === 'RAG')?.type).toBe('new');
    expect(out.changes.find((c) => c.topic === 'jQuery')?.type).toBe(
      'deprecated'
    );
  });

  it('LLM が分類外のトピックを追加しても採用されない', () => {
    const out = parse(
      llmResponse([
        {
          type: 'new',
          topic: '存在しないトピック',
          description: validDescription,
          significance: 'high',
        },
      ])
    );

    expect(out.changes.map((c) => c.topic)).not.toContain('存在しないトピック');
  });

  it('description を書かなかった分類済みトピックは changes に入らない', () => {
    const out = parse(llmResponse([]));
    expect(out.changes).toEqual([]);
  });

  it('updated は更新候補の中からのみ許可される', () => {
    const out = parse(
      llmResponse([
        {
          type: 'updated',
          topic: 'Python', // 5→6件なので更新候補
          description: '5→6件。非同期処理の標準化で生産性が向上',
          significance: 'medium',
        },
        {
          type: 'updated',
          topic: 'RAG', // 分類済み(new)なので updated にはできない
          description: validDescription,
          significance: 'high',
        },
      ])
    );

    expect(out.changes.find((c) => c.topic === 'Python')?.type).toBe('updated');
    expect(out.changes.find((c) => c.topic === 'RAG')?.type).toBe('new');
  });

  it('updated にしなかった更新候補は unchanged に回る', () => {
    const out = parse(
      llmResponse([
        {
          type: 'new',
          topic: 'RAG',
          description: validDescription,
          significance: 'high',
        },
      ])
    );

    expect(out.unchanged).toContain('Python');
    expect(out.unchanged).not.toContain('LLMが勝手に書いた値');
  });

  it('LLM が書いた description と significance は保持される', () => {
    const out = parse(
      llmResponse([
        {
          type: 'new',
          topic: 'RAG',
          description: validDescription,
          significance: 'high',
        },
      ])
    );

    const rag = out.changes.find((c) => c.topic === 'RAG');
    expect(rag?.description).toBe(validDescription);
    expect(rag?.significance).toBe('high');
  });
});
