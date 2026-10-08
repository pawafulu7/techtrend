/**
 * 技術者向けでない記事（一般の経済・政治・事件など）を判定する（issue #722）
 *
 * 総合ニュース寄りのソース（Hacker News・Techmeme・Business Insider）は技術以外の話題も流す。
 * タグ・カテゴリでは区別できない（AI 業界の政治・金融の記事にも AI のタグが付き ai_ml になる）ため、
 * タイトルと一覧要約を LLM に渡して判定し、Article.isOffTopic を立てる。消さずにフラグにして、
 * 一覧の既定の表示から外す（includeOffTopic=true で表示できる）。
 *
 * LLM には記事の主題のラベルだけを選ばせ、外すかどうかはコードで決める（off-topic-prompt.ts）。
 */
import { Prisma, type PrismaClient } from '@/lib/prisma-exports';
import logger from '@/lib/logger';
import type {
  ExtractionConfig,
  ExtractionOptions,
  ExtractionResult,
} from '@/lib/ai/extraction';
import {
  OFF_TOPIC_PROMPT_VERSION,
  VerdictListSchema,
  buildOffTopicPrompt,
  isKnownLabel,
  isOffTopicLabel,
  parseOffTopicVerdicts,
  type OffTopicInput,
  type OffTopicVerdict,
} from './off-topic-prompt';

/** 判定する期間（日）。これより古い記事は判定しない（遡るときは days を渡す） */
export const OFF_TOPIC_WINDOW_DAYS = 7;
/** 1回の LLM 呼び出しで判定する記事数 */
export const OFF_TOPIC_BATCH_SIZE = 25;
/** 1回の実行で判定する記事数の上限 */
export const OFF_TOPIC_DEFAULT_LIMIT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/** LLM 呼び出しの差し替え口（本番は LLMExtractionPipeline） */
export interface OffTopicExtractor {
  extract<T>(
    input: unknown,
    config: ExtractionConfig<T>,
    options?: ExtractionOptions
  ): Promise<ExtractionResult<T>>;
}

export interface ClassifyOffTopicOptions {
  /** 書き込まずに判定だけする */
  dryRun?: boolean;
  /** 期間の終わり（既定は現在） */
  now?: Date;
  /** 判定する期間（日） */
  days?: number;
  /** 1回で判定する記事数の上限 */
  limit?: number;
  /** 判定済みの記事もすべて判定し直す（既定では、未判定と、判定の後に要約を作り直した記事だけ） */
  recheck?: boolean;
}

export interface ClassifiedArticle extends OffTopicInput {
  isOffTopic: boolean;
  topic: string;
  evidence: string;
}

export interface ClassifyOffTopicResult {
  candidates: number;
  classified: number;
  offTopic: number;
  /** isOffTopic の値が変わった記事数（書き込む直前の値と比べる。一覧のキャッシュを捨てるかの判断に使う） */
  changed: number;
  /** 判定か書き込みに失敗したバッチ数（その記事は未判定のまま残り、次の実行で判定し直す） */
  failedBatches: number;
  /** TOPIC_POLICY に無いラベルが返った記事数（残す側に倒している。多ければプロンプトを見直す） */
  unknownLabels: number;
  /** 判定した後、要約が変わっていたので書き込まなかった記事数 */
  skippedStale: number;
  articles: ClassifiedArticle[];
}

export async function classifyOffTopicArticles(
  prisma: PrismaClient,
  extractor: OffTopicExtractor,
  options: ClassifyOffTopicOptions = {}
): Promise<ClassifyOffTopicResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? OFF_TOPIC_WINDOW_DAYS;
  const limit = options.limit ?? OFF_TOPIC_DEFAULT_LIMIT;

  const from = new Date(now.getTime() - days * DAY_MS);
  const rows = await prisma.article.findMany({
    where: {
      isHidden: false,
      AND: [
        // 空文字の要約は未要約の扱い（要約ができてから判定する）
        { summary: { not: null } },
        { summary: { not: '' } },
        // 公開が古くても、収集したばかりの記事は判定する
        {
          OR: [
            { publishedAt: { gte: from, lt: now } },
            { createdAt: { gte: from, lt: now } },
          ],
        },
        // 判定の後に要約を作り直した記事は、新しい要約で判定し直す
        ...(options.recheck
          ? []
          : [
              {
                OR: [
                  { offTopicCheckedAt: null },
                  {
                    offTopicCheckedAt: {
                      lt: prisma.article.fields.summaryComputedAt,
                    },
                  },
                ],
              },
            ]),
      ],
    },
    select: {
      id: true,
      title: true,
      translatedTitle: true,
      summary: true,
      source: { select: { name: true } },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const result: ClassifyOffTopicResult = {
    candidates: rows.length,
    classified: 0,
    offTopic: 0,
    changed: 0,
    failedBatches: 0,
    unknownLabels: 0,
    skippedStale: 0,
    articles: [],
  };

  for (let start = 0; start < rows.length; start += OFF_TOPIC_BATCH_SIZE) {
    const batch = rows.slice(start, start + OFF_TOPIC_BATCH_SIZE);
    const inputs: OffTopicInput[] = batch.map((row) => ({
      id: row.id,
      title: row.title,
      translatedTitle: row.translatedTitle,
      summary: row.summary,
      sourceName: row.source.name,
    }));

    const extraction = await extractor.extract<OffTopicVerdict[]>(
      inputs,
      {
        schema: VerdictListSchema,
        promptVersion: OFF_TOPIC_PROMPT_VERSION,
        buildPrompt: () => buildOffTopicPrompt(inputs),
        parseResponse: (text) => parseOffTopicVerdicts(text, inputs.length),
      },
      { temperature: 0, maxOutputTokens: 4000 }
    );

    // 判定できなかった記事は未判定のまま残し、次の実行で判定し直す（既定の表示には残る）
    if (!extraction.success || !extraction.data) {
      result.failedBatches++;
      continue;
    }

    const classified: ClassifiedArticle[] = extraction.data.map((verdict) => {
      if (!isKnownLabel(verdict.topic)) result.unknownLabels++;
      return {
        ...inputs[verdict.i - 1],
        isOffTopic: isOffTopicLabel(verdict.topic),
        topic: verdict.topic,
        evidence: verdict.evidence,
      };
    });
    result.articles.push(...classified);
    result.classified += classified.length;
    result.offTopic += classified.filter((a) => a.isOffTopic).length;

    if (!options.dryRun) {
      // 書き込みに失敗しても、それまでのバッチの変更を呼び出し元がキャッシュに反映できるよう、
      // 例外で抜けずに数えて次へ進む
      try {
        const written = await writeVerdicts(prisma, classified);
        result.changed += written.changed;
        result.skippedStale += written.skippedStale;
      } catch (error) {
        result.failedBatches++;
        logger.warn(
          { err: error, articleIds: classified.map((a) => a.id) },
          'Failed to write off-topic verdicts'
        );
      }
    }
  }

  return result;
}

/**
 * 判定を書き込む。
 *
 * - isOffTopic と offTopicCheckedAt だけを生の SQL で書く。Prisma の update は @updatedAt を
 *   書き換え、updatedAt を CAS や差分の取得に使う処理（enrich-single-article.ts・品質スコアの
 *   バッチ）を無駄に動かすため
 * - 記事の行を id の順にロックしてから、判定に使った要約と今の要約が同じ記事だけに書く
 *   （LLM の応答を待つ間に要約が作り直された記事は、次の実行で新しい要約から判定する）
 * - changed はロックした時点の値と比べて数える（並行した実行が先に書いた値も反映する）
 */
async function writeVerdicts(
  prisma: PrismaClient,
  articles: ClassifiedArticle[]
): Promise<{ changed: number; skippedStale: number }> {
  const checkedAt = new Date();
  const ids = articles.map((a) => a.id).sort();

  return prisma.$transaction(async (tx) => {
    const current = await tx.$queryRaw<
      Array<{ id: string; isOffTopic: boolean; summary: string | null }>
    >(Prisma.sql`
      SELECT id, "isOffTopic", summary FROM "Article"
      WHERE id = ANY(${ids}::text[])
      ORDER BY id
      FOR UPDATE
    `);
    const currentById = new Map(current.map((row) => [row.id, row]));
    const writable = articles.filter(
      (a) => currentById.get(a.id)?.summary === a.summary
    );
    const changed = writable.filter(
      (a) => currentById.get(a.id)?.isOffTopic !== a.isOffTopic
    ).length;

    if (writable.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Article" AS a
        SET "isOffTopic" = v.off, "offTopicCheckedAt" = ${checkedAt}
        FROM unnest(
          ${writable.map((w) => w.id)}::text[],
          ${writable.map((w) => w.isOffTopic)}::boolean[]
        ) AS v(id, off)
        WHERE a.id = v.id
      `);
    }

    return { changed, skippedStale: articles.length - writable.length };
  });
}
