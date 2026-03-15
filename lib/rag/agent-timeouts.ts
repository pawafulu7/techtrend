/**
 * Centralized timeout constants for RAG agent search.
 *
 * Server-side (Vercel serverless):
 *   SERVER_MAX_DURATION_MS - maxDuration equivalent in ms
 *   FALLBACK_MARGIN_MS     - margin reserved for fallback execution
 *   AGENT_TIMEOUT_MS       - agent execution budget (max - margin)
 *
 * Client-side (SSE stream):
 *   CLIENT_TIMEOUT_MS      - AbortSignal timeout for fetch requests
 */
export const SERVER_MAX_DURATION_MS = 60_000;
export const FALLBACK_MARGIN_MS = 15_000;
export const AGENT_TIMEOUT_MS = SERVER_MAX_DURATION_MS - FALLBACK_MARGIN_MS;
export const CLIENT_TIMEOUT_MS = 65_000;

/** Direct search timeout for article-search mode (no LLM, embedding + vector search only) */
export const DIRECT_SEARCH_TIMEOUT_MS = 10_000;
