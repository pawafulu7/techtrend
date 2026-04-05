import { z } from 'zod';
import { RAG_TOOL_NAMES } from '@/lib/rag/constants';
import { articleLinkSchema, type ArticleLink } from '@/lib/types/article-link';
import logger from '@/lib/logger.client';

const toolOutputSchema = z.object({
  articles: z.array(articleLinkSchema).optional(),
});

/**
 * toolCallsからSemantic Search結果を抽出
 * @param toolCalls - Agent実行時のtoolCalls配列
 * @returns 抽出された記事リンク配列（similarityでソート済み）
 */
export function extractArticlesFromToolCalls(
  toolCalls: Array<{ name: string; output?: unknown }>
): ArticleLink[] {
  try {
    const relevantToolCalls = toolCalls.filter(
      (tc) =>
        tc.name === RAG_TOOL_NAMES.SEMANTIC_SEARCH ||
        tc.name === RAG_TOOL_NAMES.SEMANTIC_SEARCH_LEGACY
    );

    if (process.env.NEXT_PUBLIC_DEBUG) {
      console.debug(
        '[ArticleLinkExtractor] toolCalls received',
        toolCalls.map((tc) => ({ name: tc.name, hasOutput: !!tc.output }))
      );
      console.debug(
        '[ArticleLinkExtractor] relevant toolCalls',
        relevantToolCalls.length
      );
    }

    const articles = relevantToolCalls.flatMap((tc) => {
      const parseResult = toolOutputSchema.safeParse(tc.output);

      if (!parseResult.success) {
        if (process.env.NEXT_PUBLIC_DEBUG) {
          console.warn(
            '[ArticleLinkExtractor] Invalid tool output structure:',
            {
              toolName: tc.name,
              error: parseResult.error,
            }
          );
        }
        return [];
      }

      return parseResult.data.articles || [];
    });

    if (!articles.length && process.env.NEXT_PUBLIC_DEBUG) {
      console.warn(
        '[ArticleLinkExtractor] No articles extracted from tool calls'
      );
    }

    // 重複除去 (articleIdベース、最高similarityを優先) → similarity順でソート（降順）
    const byId = new Map<string, ArticleLink>();
    for (const a of articles) {
      const prev = byId.get(a.articleId);
      if (!prev || a.similarity > prev.similarity) {
        byId.set(a.articleId, a);
      }
    }
    return [...byId.values()].sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    logger.error(
      { errorMessage: error instanceof Error ? error.message : String(error) },
      'ArticleLinkExtractor unexpected error'
    );
    return [];
  }
}
