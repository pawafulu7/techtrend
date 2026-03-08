import { TrendAiSummarySchema } from '@/lib/types/trend-ai-summary';

/**
 * Detect statistical paraphrasing (only obvious bad patterns).
 */
export const hasStatParaphrase = (value: string): boolean =>
  /(\d+(\.\d+)?%を占|(\d+)\s*件.{0,3}(ある|注目|重要))/.test(value);

/**
 * Detect quantitative change words forbidden in core/keyTopics.
 */
export const hasQuantChangeWord = (value: string): boolean =>
  /(増加|減少|急増|急減|増えた|減った|拡大|縮小)/.test(value);

/**
 * Validate a parsed v2 summary object against schema and content rules.
 * Returns an array of error messages (empty if valid).
 */
export function validateV2Content(obj: unknown): string[] {
  const parsed = TrendAiSummarySchema.safeParse(obj);
  if (!parsed.success) return [`schema: ${parsed.error.message}`];
  if (parsed.data.version !== 'trend_ai_summary_v2')
    return ['version must be trend_ai_summary_v2'];

  const errors: string[] = [];
  if (hasStatParaphrase(parsed.data.core))
    errors.push('core must not paraphrase stats');
  if (hasQuantChangeWord(parsed.data.core))
    errors.push('core must not contain quantitative change words');
  for (const t of parsed.data.keyTopics) {
    if (
      hasStatParaphrase(t.whatHappened) ||
      hasStatParaphrase(t.whyItMatters)
    ) {
      errors.push(`keyTopics("${t.topic}") must not paraphrase stats`);
    }
    if (
      hasQuantChangeWord(t.whatHappened) ||
      hasQuantChangeWord(t.whyItMatters)
    ) {
      errors.push(
        `keyTopics("${t.topic}") must not contain quantitative change words`
      );
    }
  }
  for (const a of parsed.data.actions) {
    if (hasStatParaphrase(a.action) || hasStatParaphrase(a.reason)) {
      errors.push(`actions("${a.action}") must not paraphrase stats`);
    }
    if (hasQuantChangeWord(a.action) || hasQuantChangeWord(a.reason)) {
      errors.push(
        `actions("${a.action}") must not contain quantitative change words`
      );
    }
  }
  if (
    parsed.data.trendChanges &&
    hasStatParaphrase(parsed.data.trendChanges.summary)
  ) {
    errors.push('trendChanges.summary must not paraphrase stats');
  }
  return errors;
}

/**
 * Resolve reference keys (A1-A10) to actual article IDs.
 * Invalid reference keys are excluded; empty arrays after resolution get a fallback ID.
 */
export function resolveRefKeysToIds(
  obj: Record<string, unknown>,
  refMap: Map<string, string>,
  fallbackId: string | undefined
): void {
  const validIds = new Set(refMap.values());
  const resolve = (keys: unknown[]): string[] => {
    const resolved = keys
      .filter((k): k is string => typeof k === 'string')
      .map((k) => refMap.get(k) ?? (validIds.has(k) ? k : undefined))
      .filter((id): id is string => id !== undefined);
    const deduped = Array.from(new Set(resolved));
    if (deduped.length === 0 && fallbackId) {
      return [fallbackId];
    }
    return deduped;
  };

  // keyTopics[].evidenceArticleIds
  const keyTopics = obj.keyTopics;
  if (Array.isArray(keyTopics)) {
    for (const topic of keyTopics) {
      if (
        topic &&
        typeof topic === 'object' &&
        Array.isArray((topic as Record<string, unknown>).evidenceArticleIds)
      ) {
        (topic as Record<string, unknown>).evidenceArticleIds = resolve(
          (topic as Record<string, unknown>).evidenceArticleIds as unknown[]
        );
      }
    }
  }

  // actions[].articleIds
  const actions = obj.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (
        action &&
        typeof action === 'object' &&
        Array.isArray((action as Record<string, unknown>).articleIds)
      ) {
        (action as Record<string, unknown>).articleIds = resolve(
          (action as Record<string, unknown>).articleIds as unknown[]
        );
      }
    }
  }
}
