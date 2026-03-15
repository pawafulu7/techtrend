import { z } from 'zod';
import { sanitizeQuery } from '@/lib/rag/security/prompt-injection-detector';
import type { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import type { articleQaAgent as _articleQaAgent } from '@/lib/rag/agents/article-qa-agent';

/**
 * Agent timeout in milliseconds.
 * Set to maxDuration (30s) minus 10s margin for fallback execution.
 */
export const AGENT_TIMEOUT_MS = 20000;

/**
 * Custom error for article not found (404)
 */
export class ArticleNotFoundError extends Error {
  public readonly articleId: string;

  constructor(articleId: string) {
    super(`Article ${articleId} not found`);
    this.name = 'ArticleNotFoundError';
    this.articleId = articleId;
  }
}

/**
 * Custom error for mode context resolution failures (400)
 *
 * Note: Reserved for future mode resolution validation failures.
 * Currently not thrown by resolveModeContext (fetchQaContext throws ArticleNotFoundError).
 * May be used for invalid mode configuration, missing required fields, etc.
 */
export class ModeContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModeContextError';
  }
}

/**
 * Agent type schema for pre-validation
 *
 * Used to determine rate limit before full validation.
 * Lightweight schema to prevent DoS attacks.
 */
export const agentTypeSchema = z.object({
  agentType: z
    .enum(['article-search', 'article-qa'])
    .optional()
    .default('article-search'),
});

/**
 * Request validation schema
 *
 * Supports two agent types:
 * - article-search: Search across all articles (default)
 * - article-qa: Answer questions about a specific article (requires articleId)
 */
export const agentRequestSchema = z
  .object({
    agentType: z
      .enum(['article-search', 'article-qa'])
      .optional()
      .default('article-search')
      .describe('Agent type: article-search (default) or article-qa'),

    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .max(500, 'Query too long (max 500 characters)')
      .transform((q) => sanitizeQuery(q))
      .refine((q) => q.length > 0, {
        message: 'Query cannot be empty after sanitization',
      }),

    articleId: z
      .string()
      .cuid()
      .optional()
      .describe('Article ID (required for article-qa mode)'),
  })
  .superRefine((data, ctx) => {
    // articleId is required for article-qa mode
    if (data.agentType === 'article-qa' && !data.articleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['articleId'],
        message: 'articleId is required for article-qa mode',
      });
    }
  });

/**
 * Type definitions for request handling
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Validated request type
 *
 * Note: articleId is required when agentType='article-qa' (enforced by superRefine)
 */
export interface ValidatedRequest {
  agentType: 'article-search' | 'article-qa';
  query: string;
  articleId?: string;
}

/**
 * Mode context for agent selection and cache management
 *
 * Encapsulates all mode-specific configuration for request handling.
 */
export interface ModeContext {
  // Mode identification
  agentType: 'article-search' | 'article-qa';
  isArticleQa: boolean;

  // Agent & execution
  agent: typeof articleSearchAgent | typeof _articleQaAgent;
  systemMessage: string;

  // Language & locale
  preferredLang: 'ja' | 'en';

  // QA-specific context (only when isArticleQa=true)
  qaContext?: {
    articleId: string;
    title: string;
    updatedAt: Date;
    snippet: string;
  };

  // Observability (future extension)
  traceAttributes?: Record<string, string | number | boolean>;
  metricsTag?: string;
}
