/**
 * @jest-environment node
 */
import {
  buildOffTopicPrompt,
  classifyOffTopicArticles,
  isOffTopicLabel,
  parseOffTopicVerdicts,
  OFF_TOPIC_BATCH_SIZE,
  TOPIC_POLICY,
  type OffTopicExtractor,
  type OffTopicInput,
} from '@/lib/services/off-topic-classifier';
import type { PrismaClient } from '@/lib/prisma-exports';
import type { ExtractionConfig } from '@/lib/ai/extraction';

const NOW = new Date('2026-09-30T00:00:00Z');

const input = (id: string, overrides: Partial<OffTopicInput> = {}) => ({
  id,
  title: `Title ${id}`,
  translatedTitle: null,
  summary: `Summary ${id}`,
  sourceName: 'Techmeme',
  ...overrides,
});

const dbRow = (id: string, isOffTopic = false) => {
  const { sourceName, ...rest } = input(id);
  return { ...rest, isOffTopic, source: { name: sourceName } };
};

function makePrisma(rows: ReturnType<typeof dbRow>[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const updateMany = jest.fn((args: unknown) => args);
  const $transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    article: { findMany, updateMany },
    $transaction,
  } as unknown as PrismaClient;
  return { prisma, findMany, updateMany, $transaction };
}

/** バッチごとに decide の応答を parseResponse に通して返す extractor（null なら失敗を返す） */
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
          data: config.parseResponse(text, inputValue),
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
  it('未判定の直近の記事を判定し、技術以外と技術の記事をそれぞれ書き込む', async () => {
    const { prisma, findMany, updateMany, $transaction } = makePrisma([
      dbRow('a'),
      dbRow('b'),
      dbRow('c', true),
    ]);
    const extractor = makeExtractor((_, count) => verdictJson(count, [2]));

    const result = await classifyOffTopicArticles(prisma, extractor, {
      now: NOW,
      days: 7,
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      isHidden: false,
      summary: { not: null },
      offTopicCheckedAt: null,
      publishedAt: { gte: new Date('2026-09-23T00:00:00Z'), lt: NOW },
    });
    expect(result).toMatchObject({
      candidates: 3,
      classified: 3,
      offTopic: 1,
      // b は false → true、c は true → false に変わる
      changed: 2,
      failedBatches: 0,
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] } },
      data: { isOffTopic: true, offTopicCheckedAt: expect.any(Date) },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'c'] } },
      data: { isOffTopic: false, offTopicCheckedAt: expect.any(Date) },
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
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty(
      'offTopicCheckedAt'
    );
  });

  it('dryRun では書き込まず、判定結果だけを返す', async () => {
    const { prisma, $transaction, updateMany } = makePrisma([dbRow('a')]);
    const result = await classifyOffTopicArticles(
      prisma,
      makeExtractor((_, count) => verdictJson(count, [1])),
      { now: NOW, dryRun: true }
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
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
    const { prisma, $transaction, updateMany } = makePrisma(rows);
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
      failedBatches: 1,
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: [`id${OFF_TOPIC_BATCH_SIZE}`] } },
      data: { isOffTopic: true, offTopicCheckedAt: expect.any(Date) },
    });
  });
});
