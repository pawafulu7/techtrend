/**
 * @jest-environment node
 */
import {
  classifyOffTopicArticles,
  OFF_TOPIC_BATCH_SIZE,
  type OffTopicExtractor,
} from '@/lib/services/off-topic-classifier';
import {
  buildOffTopicPrompt,
  isOffTopicLabel,
  parseOffTopicVerdicts,
  TOPIC_POLICY,
  type OffTopicInput,
} from '@/lib/services/off-topic-prompt';
import type { Prisma, PrismaClient } from '@/lib/prisma-exports';
import type { ExtractionConfig } from '@/lib/ai/extraction';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const NOW = new Date('2026-09-30T00:00:00Z');
const SUMMARY_FIELD_REF = { name: 'summaryComputedAt' };

const input = (id: string, overrides: Partial<OffTopicInput> = {}) => ({
  id,
  title: `Title ${id}`,
  translatedTitle: null,
  summary: `Summary ${id}`,
  sourceName: 'Techmeme',
  ...overrides,
});

const dbRow = (id: string) => {
  const { sourceName, ...rest } = input(id);
  return { ...rest, source: { name: sourceName } };
};

interface StoredRow {
  isOffTopic: boolean;
  summary: string | null;
}

/**
 * DB の代わり。findMany は候補の行を返し、$transaction の中の SELECT ... FOR UPDATE は
 * stored の値を返す。UPDATE は生の SQL の値（[checkedAt, ids, offs]）を記録する
 */
function makePrisma(
  rows: ReturnType<typeof dbRow>[],
  stored: Record<string, Partial<StoredRow>> = {},
  options: { failWriteOnCall?: number } = {}
) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const updates: unknown[][] = [];
  let writeCalls = 0;
  const tx = {
    $queryRaw: jest.fn(async (sql: Prisma.Sql) => {
      const ids = sql.values[0] as string[];
      return ids.map((id) => ({
        id,
        isOffTopic: false,
        summary: `Summary ${id}`,
        ...stored[id],
      }));
    }),
    $executeRaw: jest.fn(async (sql: Prisma.Sql) => {
      updates.push(sql.values);
      return (sql.values[1] as string[]).length;
    }),
  };
  const $transaction = jest.fn(async (fn: (t: typeof tx) => unknown) => {
    writeCalls++;
    if (writeCalls === options.failWriteOnCall) {
      throw new Error('deadlock detected');
    }
    return fn(tx);
  });
  const prisma = {
    article: { findMany, fields: { summaryComputedAt: SUMMARY_FIELD_REF } },
    $transaction,
  } as unknown as PrismaClient;
  return { prisma, findMany, $transaction, tx, updates };
}

/**
 * バッチごとに decide の応答を、パイプラインと同じく parseResponse と schema に通して返す
 * extractor（null なら失敗を返す）
 */
function makeExtractor(
  decide: (batchIndex: number, count: number) => string | null
): OffTopicExtractor & { extract: jest.Mock } {
  let batchIndex = 0;
  return {
    extract: jest.fn(
      async (inputValue: unknown, config: ExtractionConfig<unknown>) => {
        const count = (inputValue as OffTopicInput[]).length;
        const text = decide(batchIndex++, count);
        if (text === null) {
          return {
            success: false,
            data: null,
            error: 'failed',
            modelVersion: 'test',
            promptVersion: config.promptVersion,
          };
        }
        return {
          success: true,
          data: config.schema.parse(config.parseResponse(text, inputValue)),
          modelVersion: 'test',
          promptVersion: config.promptVersion,
        };
      }
    ),
  } as OffTopicExtractor & { extract: jest.Mock };
}

const verdictJson = (count: number, offTopic: number[] = []) =>
  JSON.stringify(
    Array.from({ length: count }, (_, k) => ({
      i: k + 1,
      topic: offTopic.includes(k + 1) ? 'finance' : 'software',
      evidence: 'e',
    }))
  );

describe('buildOffTopicPrompt', () => {
  it('記事を 1 始まりの番号で並べ、訳題と原題・ソース・要約を渡す', () => {
    const prompt = buildOffTopicPrompt([
      input('a', { translatedTitle: '訳題A', title: 'Original A' }),
      input('b', { summary: 'x'.repeat(500) }),
    ]);
    expect(prompt).toContain('[1] ソース: Techmeme');
    expect(prompt).toContain('タイトル: 訳題A（原題: Original A）');
    expect(prompt).toContain('[2] ソース: Techmeme');
    expect(prompt).toContain('（1〜2）');
    // 要約は 300 文字で切る
    expect(prompt).toContain(`要約: ${'x'.repeat(300)}`);
    expect(prompt).not.toContain('x'.repeat(301));
  });

  it('要約が無い記事は要約の行を出さない', () => {
    const prompt = buildOffTopicPrompt([input('a', { summary: null })]);
    expect(prompt).not.toContain('要約:');
  });

  it('TOPIC_POLICY のラベルをすべて示す', () => {
    const prompt = buildOffTopicPrompt([input('a')]);
    for (const label of Object.keys(TOPIC_POLICY)) {
      expect(prompt).toContain(`${label}: `);
    }
  });
});

describe('isOffTopicLabel', () => {
  it('技術の主題と unclear は残し、一般の経済・政治・生活などは外す', () => {
    for (const label of [
      'software',
      'ai',
      'product',
      'security',
      'engineering_org',
      'tech_community',
      'unclear',
    ]) {
      expect(isOffTopicLabel(label)).toBe(false);
    }
    for (const label of [
      'finance',
      'business_people',
      'politics_law',
      'market_research',
      'science_health',
      'lifestyle_culture',
      'general_news',
    ]) {
      expect(isOffTopicLabel(label)).toBe(true);
    }
  });

  it('未知のラベルは誤って外さないよう残す', () => {
    expect(isOffTopicLabel('hardware')).toBe(false);
    expect(isOffTopicLabel('toString')).toBe(false);
  });
});

describe('parseOffTopicVerdicts', () => {
  it('コードブロックと末尾のカンマを含む応答を読む', () => {
    const text =
      '```json\n[\n  {"i": 2, "topic": "finance", "evidence": "決算"},\n  {"i": 1, "topic": "software", "evidence": "OSS"},\n]\n```';
    expect(parseOffTopicVerdicts(text, 2)).toEqual([
      { i: 1, topic: 'software', evidence: 'OSS' },
      { i: 2, topic: 'finance', evidence: '決算' },
    ]);
  });

  it('evidence の中のエスケープされていない二重引用符を直して読む', () => {
    const text =
      '[\n  {"i": 1, "topic": "ai", "evidence": "AIで要件定義、"問い"の作り方"},\n  {"i": 2, "topic": "ai", "evidence": "既に \\"エスケープ\\" 済み"}\n]';
    expect(parseOffTopicVerdicts(text, 2)).toEqual([
      { i: 1, topic: 'ai', evidence: 'AIで要件定義、"問い"の作り方' },
      { i: 2, topic: 'ai', evidence: '既に "エスケープ" 済み' },
    ]);
  });

  it('正しい JSON は直さずに読む（1 行に複数の要素、evidence が topic より前でもよい）', () => {
    const text =
      '[{"i":1,"evidence":"OSS の資金","topic":"tech_community"},{"i":2,"topic":"finance","evidence":"IPO"}\n]';
    expect(parseOffTopicVerdicts(text, 2)).toEqual([
      { i: 1, topic: 'tech_community', evidence: 'OSS の資金' },
      { i: 2, topic: 'finance', evidence: 'IPO' },
    ]);
  });

  it('ラベルの表記揺れは小文字にそろえ、evidence が無くても読む', () => {
    expect(parseOffTopicVerdicts('[{"i":1,"topic":" Finance "}]', 1)).toEqual([
      { i: 1, topic: 'finance', evidence: '' },
    ]);
  });

  it('番号の欠け・重複・範囲外は例外にする（パイプラインが再試行する）', () => {
    expect(() => parseOffTopicVerdicts(verdictJson(1), 2)).toThrow(
      'Expected 2 verdicts'
    );
    expect(() =>
      parseOffTopicVerdicts(
        '[{"i":1,"topic":"ai","evidence":""},{"i":1,"topic":"ai","evidence":""}]',
        2
      )
    ).toThrow('Duplicate verdict index');
    expect(() =>
      parseOffTopicVerdicts('[{"i":3,"topic":"ai","evidence":""}]', 1)
    ).toThrow('out of range');
  });

  it('配列でない応答は例外にする', () => {
    expect(() =>
      parseOffTopicVerdicts('{"i":1,"topic":"ai","evidence":""}', 1)
    ).toThrow();
  });
});

describe('classifyOffTopicArticles', () => {
  it('未判定か、判定の後に要約を作り直した直近の記事を対象にする', async () => {
    const { prisma, findMany } = makePrisma([]);
    await classifyOffTopicArticles(
      prisma,
      makeExtractor(() => '[]'),
      {
        now: NOW,
        days: 7,
      }
    );

    const from = new Date('2026-09-23T00:00:00Z');
    expect(findMany.mock.calls[0][0].where).toEqual({
      isHidden: false,
      AND: [
        { summary: { not: null } },
        { summary: { not: '' } },
        {
          OR: [
            { publishedAt: { gte: from, lt: NOW } },
            { createdAt: { gte: from, lt: NOW } },
          ],
        },
        {
          OR: [
            { offTopicCheckedAt: null },
            { offTopicCheckedAt: { lt: SUMMARY_FIELD_REF } },
          ],
        },
      ],
    });
  });

  it('recheck のときは判定済みの記事も対象にする', async () => {
    const { prisma, findMany } = makePrisma([]);
    await classifyOffTopicArticles(
      prisma,
      makeExtractor(() => '[]'),
      {
        now: NOW,
        recheck: true,
      }
    );
    const conditions = findMany.mock.calls[0][0].where.AND;
    expect(JSON.stringify(conditions)).not.toContain('offTopicCheckedAt');
  });

  it('判定を 1 本の UPDATE で書き、ロックした時点の値と比べて changed を数える', async () => {
    const { prisma, tx, updates } = makePrisma(
      [dbRow('b'), dbRow('a'), dbRow('c')],
      { c: { isOffTopic: true } }
    );
    const extractor = makeExtractor((_, count) => verdictJson(count, [1]));

    const result = await classifyOffTopicArticles(prisma, extractor, {
      now: NOW,
    });

    // 行は id の順にロックする
    expect(tx.$queryRaw.mock.calls[0][0].values).toEqual([['a', 'b', 'c']]);
    expect(updates).toEqual([
      [expect.any(Date), ['b', 'a', 'c'], [true, false, false]],
    ]);
    expect(result).toMatchObject({
      candidates: 3,
      classified: 3,
      offTopic: 1,
      // b は false → true、c は true → false に変わる
      changed: 2,
      failedBatches: 0,
      skippedStale: 0,
      unknownLabels: 0,
    });
  });

  it('判定の間に要約が変わった記事は書かない', async () => {
    const { prisma, updates } = makePrisma([dbRow('a'), dbRow('b')], {
      b: { summary: '作り直した要約' },
    });
    const result = await classifyOffTopicArticles(
      prisma,
      makeExtractor((_, count) => verdictJson(count, [2])),
      { now: NOW }
    );
    expect(updates).toEqual([[expect.any(Date), ['a'], [false]]]);
    expect(result).toMatchObject({ skippedStale: 1, changed: 0 });
  });

  it('未知のラベルは残す側にして数える', async () => {
    const { prisma, updates } = makePrisma([dbRow('a')]);
    const result = await classifyOffTopicArticles(
      prisma,
      makeExtractor(() => '[{"i":1,"topic":"hardware","evidence":"e"}]'),
      { now: NOW }
    );
    expect(updates).toEqual([[expect.any(Date), ['a'], [false]]]);
    expect(result.unknownLabels).toBe(1);
  });

  it('dryRun では書き込まず、判定結果だけを返す', async () => {
    const { prisma, $transaction } = makePrisma([dbRow('a')]);
    const result = await classifyOffTopicArticles(
      prisma,
      makeExtractor((_, count) => verdictJson(count, [1])),
      { now: NOW, dryRun: true }
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(result.articles).toEqual([
      expect.objectContaining({
        id: 'a',
        isOffTopic: true,
        topic: 'finance',
        evidence: 'e',
      }),
    ]);
  });

  it('判定に失敗したバッチは書き込まず未判定のまま残し、他のバッチは続ける', async () => {
    const rows = Array.from({ length: OFF_TOPIC_BATCH_SIZE + 1 }, (_, k) =>
      dbRow(`id${k}`)
    );
    const { prisma, updates } = makePrisma(rows);
    const extractor = makeExtractor((batch, count) =>
      batch === 0 ? null : verdictJson(count, [1])
    );

    const result = await classifyOffTopicArticles(prisma, extractor, {
      now: NOW,
    });

    expect(extractor.extract).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      candidates: OFF_TOPIC_BATCH_SIZE + 1,
      classified: 1,
      offTopic: 1,
      changed: 1,
      failedBatches: 1,
    });
    expect(updates).toEqual([
      [expect.any(Date), [`id${OFF_TOPIC_BATCH_SIZE}`], [true]],
    ]);
  });

  it('書き込みに失敗しても例外で抜けず、それまでの changed を返す', async () => {
    const rows = Array.from({ length: OFF_TOPIC_BATCH_SIZE + 1 }, (_, k) =>
      dbRow(`id${k}`)
    );
    const { prisma } = makePrisma(rows, {}, { failWriteOnCall: 2 });
    const result = await classifyOffTopicArticles(
      prisma,
      makeExtractor((_, count) => verdictJson(count, [1])),
      { now: NOW }
    );
    expect(result).toMatchObject({ changed: 1, failedBatches: 1 });
  });
});
