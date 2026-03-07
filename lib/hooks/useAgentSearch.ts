'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ArticleLink } from '@/lib/types/article-link';
import { extractArticlesFromToolCalls } from '@/lib/utils/article/article-link-extractor';

export interface AgentSearchResult {
  query: string;
  response: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: unknown;
    dynamic: boolean;
    output?: unknown;
  }>;
  usage: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  cached: boolean;
  fallback: boolean;
  articles?: ArticleLink[];
}

export interface AgentSearchError {
  status: number;
  message: string;
  details?: unknown;
  retryAfter?: number;
}

export interface UseAgentSearchOptions {
  onSuccess?: (data: AgentSearchResult) => void;
  onError?: (error: AgentSearchError) => void;
  timeout?: number;
}

export type SearchStep =
  | 'idle'
  | 'searching'
  | 'analyzing'
  | 'generating'
  | 'complete'
  | 'error';

export interface UseAgentSearchReturn {
  search: (query: string) => Promise<void>;
  result: AgentSearchResult | null;
  error: AgentSearchError | null;
  isLoading: boolean;
  partialText: string | null;
  currentStep: SearchStep;
  reset: () => void;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Parse SSE stream
 *
 * @param response - Fetch response with SSE stream
 * @param controller - AbortController for timeout management
 * @param callbacksRef - Callbacks reference (onSuccess, onError)
 * @param query - Original query for result metadata
 * @param setPartialText - State setter for partial text storage
 * @param requestId - Unique identifier for the originating request
 * @param getActiveRequestId - Getter for the currently active request id
 * @param setCurrentStep - State setter for current step tracking
 */
async function parseSSEStream(
  response: Response,
  controller: AbortController,
  callbacksRef: React.MutableRefObject<UseAgentSearchOptions | undefined>,
  query: string,
  setPartialText: (text: string | null) => void,
  requestId: string,
  getActiveRequestId: () => string | null,
  setCurrentStep: (step: SearchStep) => void
): Promise<AgentSearchResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let accumulatedText = '';
  const toolCalls: any[] = [];
  let usage = { totalTokens: 0 };
  let cached = false;
  let fallback = false;

  // Timeout reset on each chunk
  let lastChunkTime = Date.now();
  const chunkTimeout = callbacksRef.current?.timeout ?? DEFAULT_TIMEOUT;

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
          // Cached responses skip to generating step
          setCurrentStep('generating');
          accumulatedText = eventData.text;
          cached = true;
          setPartialText(accumulatedText);
        } else if (eventData.type === 'text-delta') {
          if (isStaleChunk()) {
            continue;
          }
          // Transition to generating when text starts streaming
          setCurrentStep('generating');
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
          // Transition to analyzing when tool execution starts
          setCurrentStep('analyzing');
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
          usage = eventData.usage || usage;
          cached = eventData.cached || cached;
          fallback = eventData.fallback || fallback;
          // Restore toolCalls from finish event (for cached responses)
          if (eventData.toolCalls && Array.isArray(eventData.toolCalls)) {
            toolCalls.splice(0, toolCalls.length, ...eventData.toolCalls);
          }

          if (process.env.NEXT_PUBLIC_DEBUG) {
            console.log('[SSE] Stream finished', {
              textLength: accumulatedText.length,
              toolCalls: toolCalls.length,
              cached,
              fallback,
            });
          }

          break;
        } else if (eventData.type === 'error') {
          throw new Error(eventData.message || 'Stream error');
        }
      }
    }

    const articles = extractArticlesFromToolCalls(toolCalls);

    return {
      query,
      response: accumulatedText,
      toolCalls,
      usage,
      articles,
      cached,
      fallback,
    };
  } finally {
    reader.releaseLock();
  }
}

export function useAgentSearch(
  options?: UseAgentSearchOptions
): UseAgentSearchReturn {
  const [result, setResult] = useState<AgentSearchResult | null>(null);
  const [error, setError] = useState<AgentSearchError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [partialText, setPartialText] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<SearchStep>('idle');

  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef(options);
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
    if (!query.trim()) {
      const emptyError: AgentSearchError = {
        status: 400,
        message: 'Query cannot be empty',
      };
      setError(emptyError);
      callbacksRef.current?.onError?.(emptyError);
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
    setCurrentStep('searching');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeout = callbacksRef.current?.timeout ?? DEFAULT_TIMEOUT;
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeout);

    try {
      const response = await fetch('/api/rag/agent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      // Content-Type detection: SSE vs. JSON
      const ct = response.headers.get('Content-Type') || '';

      // Early error handling (401, 429, 400) - always JSON
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

        const agentError: AgentSearchError = {
          status: response.status,
          message:
            (data && typeof data.error === 'string' && data.error) ||
            response.statusText ||
            'Unknown error',
          details: data?.details,
          retryAfter,
        };

        setError(agentError);
        setCurrentStep('error');
        callbacksRef.current?.onError?.(agentError);
        clearTimeout(timeoutId);
        return;
      }

      // Success (200番台) - handle SSE or JSON
      if (ct.includes('text/event-stream')) {
        // Streaming mode
        const streamResult = await parseSSEStream(
          response,
          controller,
          callbacksRef,
          query,
          setPartialText,
          requestId,
          () => activeRequestIdRef.current,
          setCurrentStep
        );

        setResult(streamResult);
        setCurrentStep('complete');
        callbacksRef.current?.onSuccess?.(streamResult);
        clearTimeout(timeoutId);
      } else if (ct.includes('application/json')) {
        // Batch mode (backward compatibility)
        const data = await response.json();
        const safeToolCalls = Array.isArray(data.toolCalls)
          ? data.toolCalls
          : [];
        const articles = extractArticlesFromToolCalls(safeToolCalls);

        if (process.env.NEXT_PUBLIC_DEBUG) {
          console.log('[useAgentSearch] Extracted articles:', articles);
          console.log('[useAgentSearch] toolCalls:', safeToolCalls);
        }

        const resultWithArticles: AgentSearchResult = {
          ...data,
          articles,
        };
        setResult(resultWithArticles);
        setCurrentStep('complete');
        callbacksRef.current?.onSuccess?.(resultWithArticles);
        clearTimeout(timeoutId);
      } else {
        clearTimeout(timeoutId);
        throw new Error(`Unexpected content type: ${ct}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (activeRequestIdRef.current === requestId) {
        setPartialText('');
      }

      if (err instanceof Error && err.name === 'AbortError') {
        if (didTimeout) {
          const timeoutError: AgentSearchError = {
            status: 408,
            message: `Request timeout (${timeout / 1000}s)`,
          };
          setError(timeoutError);
          setCurrentStep('error');
          callbacksRef.current?.onError?.(timeoutError);
        }
      } else {
        const networkError: AgentSearchError = {
          status: 0,
          message: err instanceof Error ? err.message : 'Network error',
        };
        setError(networkError);
        setCurrentStep('error');
        callbacksRef.current?.onError?.(networkError);
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
    setCurrentStep('idle');
  }, []);

  return {
    search,
    result,
    error,
    isLoading,
    partialText,
    currentStep,
    reset,
  };
}
