import { z } from 'zod';
import { RAG_TOOL_NAMES } from '@/lib/rag/constants';
import { articleLinkSchema, type ArticleLink } from '@/lib/types/article-link';

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
    const articles = toolCalls
      .filter(tc => tc.name === RAG_TOOL_NAMES.SEMANTIC_SEARCH)
      .flatMap(tc => {
        const parseResult = toolOutputSchema.safeParse(tc.output);

        if (!parseResult.success) {
          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.warn('[ArticleLinkExtractor] Invalid tool output structure:', {
              toolName: tc.name,
              error: parseResult.error,
            });
          }
          return [];
        }

        return parseResult.data.articles || [];
      });

    // 重複除去 (articleIdベース) → similarity順でソート（降順）
    const deduped = Array.from(new Map(articles.map((a) => [a.articleId, a])).values());
    return deduped.sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('[ArticleLinkExtractor] Unexpected error:', error);
    return [];
  }
}
