import { z } from 'zod';

export const TrendAiSummaryV1Schema = z.object({
  version: z.literal('trend_ai_summary_v1'),
  headline: z.string().min(1),
  keyTopics: z.array(z.object({
    topic: z.string().min(1),
    reason: z.string().min(1),
    evidenceArticleIds: z.array(z.string().min(1)).optional(),
    evidenceNumbers: z.array(z.object({
      label: z.string().min(1),
      value: z.string().min(1),
    })).optional(),
  })).min(1).max(6),
  numbers: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
  })).min(1).max(8).optional(),
  actions: z.array(z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
    relatedTopics: z.array(z.string().min(1)).optional(),
    relatedArticleIds: z.array(z.string().min(1)).optional(),
  })).min(1).max(6),
  notes: z.array(z.string().min(1)).max(6).optional(),
}).strict();

export type TrendAiSummaryV1 = z.infer<typeof TrendAiSummaryV1Schema>;

export function extractFirstJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // continue
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/**
 * AI要約文字列をパースしてTrendAiSummaryV1に変換
 * JSONパースに失敗した場合はnullを返す
 */
export function parseTrendAiSummary(aiSummary: string | null | undefined): TrendAiSummaryV1 | null {
  if (!aiSummary) return null;

  const obj = extractFirstJsonObject(aiSummary);
  if (!obj) return null;

  const result = TrendAiSummaryV1Schema.safeParse(obj);
  if (result.success) {
    return result.data;
  }
  return null;
}

/**
 * 旧形式のプレーンテキストをパースして簡易的なTrendAiSummaryV1に変換
 * フォールバック用
 */
export function parseLegacyAiSummary(aiSummary: string | null | undefined): TrendAiSummaryV1 | null {
  if (!aiSummary) return null;

  // JSON形式の場合は通常のパースを試みる
  if (aiSummary.trim().startsWith('{')) {
    return parseTrendAiSummary(aiSummary);
  }

  // 旧形式: [注目トピック] (1) AI: 理由... のパース
  try {
    const keyTopics: TrendAiSummaryV1['keyTopics'] = [];
    const actions: TrendAiSummaryV1['actions'] = [];

    // (1) (2) (3) 形式のトピックを抽出
    const topicMatches = aiSummary.matchAll(/\((\d+)\)\s*([^:]+)[：:]\s*([^(]+?)(?=\(\d+\)|$|\[)/g);
    for (const match of topicMatches) {
      keyTopics.push({
        topic: match[2].trim(),
        reason: match[3].trim(),
      });
    }

    // [アクションポイント] 以降のテキストを抽出
    const actionMatch = aiSummary.match(/\[アクションポイント\]\s*([\s\S]+?)(?:$|\[)/);
    if (actionMatch) {
      actions.push({
        title: 'Today\'s Action',
        detail: actionMatch[1].trim(),
      });
    }

    if (keyTopics.length === 0) {
      return null;
    }

    return {
      version: 'trend_ai_summary_v1',
      headline: keyTopics[0]?.topic ? `${keyTopics[0].topic}が注目を集める` : 'Tech Trend Analysis',
      keyTopics,
      actions: actions.length > 0 ? actions : [{ title: 'Stay Updated', detail: 'Check the top articles below.' }],
    };
  } catch {
    return null;
  }
}

