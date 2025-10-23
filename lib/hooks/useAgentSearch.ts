'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface AgentSearchResult {
  query: string;
  response: string;
  toolCalls: Array<{ id: string; name: string; input: unknown; dynamic: boolean }>;
  usage: { totalTokens: number; promptTokens?: number; completionTokens?: number };
  cached: boolean;
  fallback: boolean;
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

export interface UseAgentSearchReturn {
  search: (query: string) => Promise<void>;
  result: AgentSearchResult | null;
  error: AgentSearchError | null;
  isLoading: boolean;
  reset: () => void;
}

const DEFAULT_TIMEOUT = 30000;

export function useAgentSearch(options?: UseAgentSearchOptions): UseAgentSearchReturn {
  const [result, setResult] = useState<AgentSearchResult | null>(null);
  const [error, setError] = useState<AgentSearchError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef(options);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        const emptyError: AgentSearchError = {
          status: 400,
          message: 'Query cannot be empty',
        };
        setError(emptyError);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsLoading(true);
      setError(null);
      setResult(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch('/api/rag/agent-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          return;
        }

        const data = await response.json();

        if (!response.ok) {
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
            message: data.error || 'Unknown error',
            details: data.details,
            retryAfter,
          };

          setError(agentError);
          callbacksRef.current?.onError?.(agentError);
          return;
        }

        setResult(data);
        callbacksRef.current?.onSuccess?.(data);
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error && err.name === 'AbortError') {
          const timeoutError: AgentSearchError = {
            status: 408,
            message: `Request timeout (${timeout / 1000}s)`,
          };
          setError(timeoutError);
          callbacksRef.current?.onError?.(timeoutError);
        } else {
          const networkError: AgentSearchError = {
            status: 0,
            message: err instanceof Error ? err.message : 'Network error',
          };
          setError(networkError);
          callbacksRef.current?.onError?.(networkError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    search,
    result,
    error,
    isLoading,
    reset,
  };
}
