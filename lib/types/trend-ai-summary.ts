import { z } from 'zod';

export const TrendAiSummaryV1Schema = z
  .object({
    version: z.literal('trend_ai_summary_v1'),
    headline: z.string().min(1),
    keyTopics: z
      .array(
        z.object({
          topic: z.string().min(1),
          reason: z.string().min(1),
          evidenceArticleIds: z.array(z.string().min(1)).optional(),
          evidenceNumbers: z
            .array(
              z.object({
                label: z.string().min(1),
                value: z.string().min(1),
              })
            )
            .optional(),
        })
      )
      .min(1)
      .max(6),
    numbers: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
        })
      )
      .min(1)
      .max(8)
      .optional(),
    actions: z
      .array(
        z.object({
          title: z.string().min(1),
          detail: z.string().min(1),
          relatedTopics: z.array(z.string().min(1)).optional(),
          relatedArticleIds: z.array(z.string().min(1)).optional(),
        })
      )
      .min(1)
      .max(6),
    notes: z.array(z.string().min(1)).max(6).optional(),
  })
  .strict();

export type TrendAiSummaryV1 = z.infer<typeof TrendAiSummaryV1Schema>;

export const TrendAiSummaryV2Schema = z
  .object({
    version: z.literal('trend_ai_summary_v2'),
    core: z.string().min(1),
    overview: z.string().min(1),
    keyTopics: z
      .array(
        z.object({
          topic: z.string().min(1),
          whatHappened: z.string().min(1),
          whyItMatters: z.string().min(1),
          evidenceArticleIds: z.array(z.string().min(1)).min(1).max(5),
        })
      )
      .min(1)
      .max(6),
    trendChanges: z
      .object({
        available: z.boolean(),
        basis: z
          .object({
            periodLabel: z.string().min(1),
            date: z.string().min(1).optional(),
          })
          .optional(),
        new: z
          .array(
            z.object({
              topic: z.string().min(1),
              deltaCount: z.number().int(),
              reason: z.string().min(1),
            })
          )
          .max(10),
        rising: z
          .array(
            z.object({
              topic: z.string().min(1),
              deltaCount: z.number().int(),
              reason: z.string().min(1),
            })
          )
          .max(10),
        falling: z
          .array(
            z.object({
              topic: z.string().min(1),
              deltaCount: z.number().int(),
              reason: z.string().min(1),
            })
          )
          .max(10),
        summary: z.string().min(1),
      })
      .strict()
      .optional(),
    actions: z
      .array(
        z.object({
          action: z.string().min(1),
          reason: z.string().min(1),
          articleIds: z.array(z.string().min(1)).min(1).max(5),
        })
      )
      .min(1)
      .max(6),
    numbers: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
        })
      )
      .max(10)
      .optional(),
    notes: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict();

export type TrendAiSummaryV2 = z.infer<typeof TrendAiSummaryV2Schema>;

export const TrendAiSummarySchema = z.discriminatedUnion('version', [
  TrendAiSummaryV1Schema,
  TrendAiSummaryV2Schema,
]);

export type TrendAiSummary = z.infer<typeof TrendAiSummarySchema>;

export function extractFirstJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripCodeFences = (input: string) => {
    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (fenced?.[1] ?? input).trim();
  };

  const tryParse = (input: string): unknown | null => {
    const candidate = input.trim();
    if (!candidate) return null;

    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // continue
    }

    // common minor JSON mistakes (trailing commas)
    const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
    if (withoutTrailingCommas !== candidate) {
      try {
        return JSON.parse(withoutTrailingCommas) as unknown;
      } catch {
        // continue
      }
    }

    return null;
  };

  const unfenced = stripCodeFences(trimmed);
  const direct = tryParse(unfenced);
  if (direct) return direct;

  const start = unfenced.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < unfenced.length; i += 1) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return tryParse(unfenced.slice(start, i + 1));
      }
    }
  }

  // fallback: try the broadest slice between first "{" and last "}"
  const end = unfenced.lastIndexOf('}');
  if (end > start) {
    return tryParse(unfenced.slice(start, end + 1));
  }

  return null;
}

/**
 * AI要約文字列をパースしてTrendAiSummaryV1に変換
 * JSONパースに失敗した場合はnullを返す
 */
export function parseTrendAiSummary(
  aiSummary: string | null | undefined
): TrendAiSummary | null {
  if (!aiSummary) return null;

  const obj = extractFirstJsonObject(aiSummary);
  if (!obj) return null;

  const result = TrendAiSummarySchema.safeParse(obj);
  if (result.success) {
    return result.data;
  }
  return null;
}

/**
 * 旧形式のプレーンテキストをパースして簡易的なTrendAiSummaryV1に変換
 * フォールバック用
 */
/** Article metadata used for evidence lookups in trend API responses */
export type EvidenceArticleMap = Record<
  string,
  {
    title: string;
    translatedTitle?: string | null;
    thumbnail?: string | null;
    sourceName: string;
  }
>;

export function parseLegacyAiSummary(
  aiSummary: string | null | undefined
): TrendAiSummaryV1 | null {
  if (!aiSummary) return null;

  // JSON形式の場合は通常のパースを試みる
  if (aiSummary.trim().startsWith('{')) {
    const parsed = parseTrendAiSummary(aiSummary);
    if (!parsed) return null;
    if (parsed.version === 'trend_ai_summary_v1') return parsed;
    return null;
  }

  // 旧形式: [注目トピック] (1) AI: 理由... のパース
  try {
    const keyTopics: TrendAiSummaryV1['keyTopics'] = [];
    const actions: TrendAiSummaryV1['actions'] = [];

    // (1) (2) (3) 形式のトピックを抽出
    const topicMatches = aiSummary.matchAll(
      /\((\d+)\)\s*([^:]+)[：:]\s*([^(]+?)(?=\(\d+\)|$|\[)/g
    );
    for (const match of topicMatches) {
      keyTopics.push({
        topic: match[2].trim(),
        reason: match[3].trim(),
      });
    }

    // [アクションポイント] 以降のテキストを抽出
    const actionMatch = aiSummary.match(
      /\[アクションポイント\]\s*([\s\S]+?)(?:$|\[)/
    );
    if (actionMatch) {
      actions.push({
        title: "Today's Action",
        detail: actionMatch[1].trim(),
      });
    }

    if (keyTopics.length === 0) {
      return null;
    }

    return {
      version: 'trend_ai_summary_v1',
      headline: keyTopics[0]?.topic
        ? `${keyTopics[0].topic}が注目を集める`
        : 'Tech Trend Analysis',
      keyTopics,
      actions:
        actions.length > 0
          ? actions
          : [
              {
                title: 'Stay Updated',
                detail: 'Check the top articles below.',
              },
            ],
    };
  } catch {
    return null;
  }
}
