'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface QAContext {
  articleId: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface ArticleQAResult {
  query: string;
  response: string;
  toolCalls: any[];
  usage: { totalTokens: number };
  cached: boolean;
  fallback: boolean;
  context?: QAContext;
}

export interface ArticleQAError {
  status: number;
  message: string;
  details?: unknown;
  retryAfter?: number;
}

export interface UseArticleQAOptions {
  articleId: string;
  articleTitle: string;
  locale?: 'ja' | 'en';
  onSuccess?: (data: ArticleQAResult) => void;
  onError?: (error: ArticleQAError) => void;
  timeout?: number;
}

export interface UseArticleQAReturn {
  search: (query: string) => Promise<void>;
  result: ArticleQAResult | null;
  error: ArticleQAError | null;
  isLoading: boolean;
  partialText: string | null;
  contextChunk: QAContext | null;
  reset: () => void;
}

const DEFAULT_TIMEOUT = 30000;

const normalizeQAContext = (value: unknown): QAContext | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<QAContext>;
  if (
    typeof candidate.articleId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.snippet === 'string' &&
    typeof candidate.updatedAt === 'string'
  ) {
    return {
      articleId: candidate.articleId,
      title: candidate.title,
      snippet: candidate.snippet,
      updatedAt: candidate.updatedAt,
    };
  }

  return null;
};

/**
 * Parse SSE stream for Article QA
 */
async function parseSSEStream(
  response: Response,
  controller: AbortController,
  callbacksRef: React.MutableRefObject<UseArticleQAOptions>,
  query: string,
  setPartialText: (text: string | null) => void,
  setContextChunk: (context: QAContext | null) => void,
  requestId: string,
  getActiveRequestId: () => string | null
): Promise<ArticleQAResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let accumulatedText = '';
  const toolCalls: any[] = [];
  let usage = { totalTokens: 0 };
  let cached = false;
  let fallback = false;
  let latestContext: QAContext | null = null;

  let lastChunkTime = Date.now();
  const chunkTimeout = callbacksRef.current.timeout ?? DEFAULT_TIMEOUT;

  const resetTimeout = () => {
    lastChunkTime = Date.now();
  };

  const checkTimeout = () => {
    if (Date.now() - lastChunkTime > chunkTimeout) {
      controller.abort();
      throw new Error('Stream timeout - no chunks received');
    }
  };

  const isStaleChunk = () => getActiveRequestId() !== requestId;

  const handleContextPayload = (payload: unknown) => {
    if (isStaleChunk()) {
      return;
    }
    const normalized = normalizeQAContext(payload);
    if (normalized) {
      latestContext = normalized;
      setContextChunk(normalized);
      if (process.env.NEXT_PUBLIC_DEBUG) {
        console.log('[SSE] QA context chunk received', normalized);
      }
    }
  };

  try {
    let buffer = '';

    while (true) {
      checkTimeout();

      const { done, value } = await reader.read();

      if (done) break;

      resetTimeout();

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith(':')) {
          continue;
        }

        if (!line.startsWith('data: ')) continue;

        const eventData = JSON.parse(line.slice(6));

        if (eventData.type === 'cached') {
          if (isStaleChunk()) {
            continue;
          }
          accumulatedText = eventData.text;
          cached = true;
          setPartialText(accumulatedText);
        } else if (eventData.type === 'text-delta') {
          if (isStaleChunk()) {
            continue;
          }
          const delta = eventData.delta ?? '';
          accumulatedText += delta;
          setPartialText(accumulatedText);

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log('[SSE] Text delta:', {
              deltaLength: delta.length,
              accumulatedChars: accumulatedText.length,
            });
          }
        } else if (eventData.type === 'tool-start') {
          toolCalls.push({
            id: eventData.toolCallId,
            name: eventData.toolName,
            input: eventData.input,
            dynamic: false,
          });

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log('[SSE] Tool started:', eventData.toolName);
          }
        } else if (eventData.type === 'tool-complete') {
          const toolCall = toolCalls.find(
            (tc) => tc.id === eventData.toolCallId
          );
          if (toolCall) {
            toolCall.output = eventData.result;
          }

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log('[SSE] Tool completed:', eventData.toolCallId);
          }
        } else if (eventData.type === 'qa-context') {
          handleContextPayload(
            eventData.context ?? eventData.payload ?? eventData.data
          );
        } else if (eventData.type === 'fallback') {
          if (isStaleChunk()) {
            continue;
          }
          accumulatedText = eventData.text;
          fallback = true;
          setPartialText(accumulatedText);

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log(
              '[SSE] Fallback mode, resultCount:',
              eventData.resultCount
            );
          }
        } else if (eventData.type === 'finish') {
          if (
            eventData.usage &&
            typeof eventData.usage.totalTokens === 'number'
          ) {
            usage = { totalTokens: eventData.usage.totalTokens };
          }
          if (Array.isArray(eventData.toolCalls)) {
            toolCalls.splice(0, toolCalls.length, ...eventData.toolCalls);
          }
          cached = eventData.cached ?? cached;
          fallback = eventData.fallback ?? fallback;
          if (eventData.context || eventData.qaContext) {
            handleContextPayload(eventData.context ?? eventData.qaContext);
          }

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log('[SSE] Stream finished', {
              textLength: accumulatedText.length,
              toolCalls: toolCalls.length,
              cached,
              fallback,
              hasContext: Boolean(latestContext),
            });
          }

          break;
        } else if (eventData.type === 'error') {
          throw new Error(eventData.message || 'Stream error');
        }
      }
    }

    return {
      query,
      response: accumulatedText,
      toolCalls,
      usage,
      cached,
      fallback,
      context: latestContext ?? undefined,
    };
  } finally {
    reader.releaseLock();
  }
}

export function useArticleQA(options: UseArticleQAOptions): UseArticleQAReturn {
  const [result, setResult] = useState<ArticleQAResult | null>(null);
  const [error, setError] = useState<ArticleQAError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [partialText, setPartialText] = useState<string | null>(null);
  const [contextChunk, setContextChunk] = useState<QAContext | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef<UseArticleQAOptions>(options);
  const activeRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const search = useCallback(async (query: string) => {
    const currentOptions = callbacksRef.current;

    if (!query.trim()) {
      const emptyError: ArticleQAError = {
        status: 400,
        message: 'Query cannot be empty',
      };
      setError(emptyError);
      currentOptions.onError?.(emptyError);
      return;
    }

    if (!currentOptions.articleId) {
      const configError: ArticleQAError = {
        status: 400,
        message: 'Article information is required',
      };
      setError(configError);
      currentOptions.onError?.(configError);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const requestId = `req-${Date.now()}-${Math.random()}`;
    activeRequestIdRef.current = requestId;
    setActiveRequestId(requestId);

    setIsLoading(true);
    setError(null);
    setResult(null);
    setPartialText('');
    setContextChunk(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeout = currentOptions.timeout ?? DEFAULT_TIMEOUT;
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeout);

    const isStaleRequest = () => activeRequestIdRef.current !== requestId;

    try {
      const payload: Record<string, unknown> = {
        query,
        agentType: 'article-qa',
        articleId: currentOptions.articleId,
        articleTitle: currentOptions.articleTitle,
      };

      if (currentOptions.locale) {
        payload.locale = currentOptions.locale;
      }

      const response = await fetch('/api/rag/agent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const ct = response.headers.get('Content-Type') || '';

      if (!response.ok) {
        let data: any = null;
        if (ct.includes('application/json')) {
          try {
            data = await response.json();
          } catch {
            data = null;
          }
        } else {
          try {
            const text = await response.text();
            data = text ? { error: text } : null;
          } catch {
            data = null;
          }
        }

        let retryAfter: number | undefined;
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed) && parsed > 0) {
              retryAfter = parsed;
            }
          }
        }

        const agentError: ArticleQAError = {
          status: response.status,
          message:
            (data && typeof data.error === 'string' && data.error) ||
            response.statusText ||
            'Unknown error',
          details: data?.details,
          retryAfter,
        };

        if (isStaleRequest()) {
          return;
        }
        setError(agentError);
        currentOptions.onError?.(agentError);
        return;
      }

      if (ct.includes('text/event-stream')) {
        const streamResult = await parseSSEStream(
          response,
          controller,
          callbacksRef,
          query,
          setPartialText,
          setContextChunk,
          requestId,
          () => activeRequestIdRef.current
        );

        if (isStaleRequest()) {
          return;
        }
        setResult(streamResult);
        currentOptions.onSuccess?.(streamResult);
      } else if (ct.includes('application/json')) {
        const data = await response.json();

        const usage =
          data?.usage && typeof data.usage.totalTokens === 'number'
            ? { totalTokens: data.usage.totalTokens }
            : { totalTokens: 0 };

        const resultWithContext: ArticleQAResult = {
          query: typeof data?.query === 'string' ? data.query : query,
          response: typeof data?.response === 'string' ? data.response : '',
          toolCalls: Array.isArray(data?.toolCalls) ? data.toolCalls : [],
          usage,
          cached: Boolean(data?.cached),
          fallback: Boolean(data?.fallback),
          context:
            normalizeQAContext(data?.context ?? data?.qaContext) ?? undefined,
        };

        if (isStaleRequest()) {
          return;
        }
        setResult(resultWithContext);
        currentOptions.onSuccess?.(resultWithContext);
      } else {
        throw new Error(`Unexpected content type: ${ct}`);
      }
    } catch (err) {
      if (isStaleRequest()) {
        return;
      }
      setPartialText('');
      setContextChunk(null);

      if (err instanceof Error && err.name === 'AbortError') {
        if (didTimeout) {
          const timeoutError: ArticleQAError = {
            status: 408,
            message: `Request timeout (${timeout / 1000}s)`,
          };
          setError(timeoutError);
          currentOptions.onError?.(timeoutError);
        }
      } else {
        const networkError: ArticleQAError = {
          status: 0,
          message: err instanceof Error ? err.message : 'Network error',
        };
        setError(networkError);
        currentOptions.onError?.(networkError);
      }
    } finally {
      clearTimeout(timeoutId);
      if (didTimeout || !controller.signal.aborted) {
        setIsLoading(false);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        setActiveRequestId(null);
        setPartialText('');
        setContextChunk(null);
      }
    }
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    activeRequestIdRef.current = null;
    setActiveRequestId(null);
    setResult(null);
    setError(null);
    setIsLoading(false);
    setPartialText('');
    setContextChunk(null);
  }, []);

  return {
    search,
    result,
    error,
    isLoading,
    partialText,
    contextChunk,
    reset,
  };
}
