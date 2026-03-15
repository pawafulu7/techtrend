'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { z } from 'zod';
import { AgentSearchBar } from './agent-search-bar';
import { AgentSampleQueries } from './agent-sample-queries';
import { LoadingSpinner } from '@/app/components/common/loading-spinner';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';

import {
  AgentRelatedQuestions,
  generateRelatedQuestions,
} from './agent-related-questions';
import { AgentSearchInterpretation } from './agent-search-interpretation';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { RAG_TOOL_NAMES } from '@/lib/rag/constants';

// Schema for semantic-search tool output validation
const SemanticSearchOutputSchema = z.object({
  originalQuery: z.string(),
  expandedQuery: z.string(),
  expansionMethod: z.enum(['none', 'dictionary', 'ai']),
});

// Hook for reduced motion preference - reacts to system setting changes
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: SSR-safe media query initialization
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
};

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const prefersReducedMotion = usePrefersReducedMotion();
  const [showResult, setShowResult] = useState(false);

  const { search, result, error, isLoading, reset } = useAgentSearch();
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    setShowResult(false);
    reset();
    await search(query);
  };

  // Show result when loading completes
  useEffect(() => {
    if (!isLoading && (result || error)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: show result when loading completes
      setShowResult(true);
    }
  }, [isLoading, result, error]);

  // Auto-scroll to result when result is shown
  useEffect(() => {
    if (showResult && resultRef.current) {
      // Auto-scroll to result with 100ms delay (Doherty threshold)
      const scrollTimer = setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'start',
          });
        }
      }, 100);

      return () => clearTimeout(scrollTimer);
    }
  }, [showResult, prefersReducedMotion]);

  const handleRetry = () => {
    if (!lastQuery) return;
    setShowResult(false);
    reset();
    search(lastQuery);
  };

  const handleFeedback = (positive: boolean) => {
    console.log(
      '[Feedback]',
      positive ? 'positive' : 'negative',
      'for query:',
      result?.query || lastQuery
    );
  };

  const handlePrefillQuery = useCallback((query: string) => {
    if (prefillQueryRef.current) {
      prefillQueryRef.current(query);
    }
  }, []);

  const handleSetPrefillCallback = useCallback(
    (callback: (query: string) => void) => {
      prefillQueryRef.current = callback;
    },
    []
  );

  // Generate related questions based on AI response
  // Note: useMemo removed - React Compiler handles memoization automatically
  const relatedQuestions = result?.response
    ? generateRelatedQuestions(result.response, result.articles)
    : [];

  // Extract search interpretation from tool calls (semantic-search output)
  // Uses Zod schema validation for runtime type safety
  // Note: useMemo removed - React Compiler handles memoization automatically
  const searchInterpretation = (() => {
    if (!result?.toolCalls) return null;

    // Find semantic-search tool call
    const semanticSearchCall = result.toolCalls.find(
      (tc) =>
        (tc.name === RAG_TOOL_NAMES.SEMANTIC_SEARCH ||
          tc.name === RAG_TOOL_NAMES.SEMANTIC_SEARCH_LEGACY) &&
        tc.output
    );

    if (!semanticSearchCall?.output) return null;

    // Validate output with Zod schema for runtime type safety
    const parsed = SemanticSearchOutputSchema.safeParse(
      semanticSearchCall.output
    );
    if (!parsed.success) return null;

    return {
      originalQuery: parsed.data.originalQuery,
      expandedQuery: parsed.data.expandedQuery,
      expansionMethod: parsed.data.expansionMethod,
    };
  })();

  return (
    <div className="w-full">
      {/* 2-column layout: Main content (left) + Sidebar (right) */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left column: Search bar + Results */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Search bar */}
          <CardV2
            variant="default"
            className="bg-[var(--tt-color-surface-muted)] p-4 shadow-[var(--tt-shadow-card-rest)]"
            data-testid="agent-search-card"
          >
            <AgentSearchBar
              onSearch={handleSearch}
              isLoading={isLoading}
              onPrefillQuery={handleSetPrefillCallback}
            />
          </CardV2>

          {/* Skip link for accessibility */}
          {showResult && (
            <a
              href="#agent-result"
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded focus:bg-[var(--tt-color-primary)] focus:px-4 focus:py-2 focus:text-white"
              onClick={(e) => {
                e.preventDefault();
                resultRef.current?.focus();
              }}
            >
              結果にスキップ
            </a>
          )}

          {/* Result area */}
          <div
            ref={resultRef}
            id="agent-result"
            className="scroll-mt-4"
            tabIndex={-1}
          >
            {isLoading && (
              <div data-testid="agent-loading-wrapper">
                <LoadingSpinner message="検索中..." fullPage={false} />
              </div>
            )}
            {!isLoading && showResult && error && (
              <CardV2
                variant="default"
                className="bg-[var(--tt-color-surface-muted)] p-6 shadow-[var(--tt-shadow-card-rest)]"
              >
                <AgentErrorDisplay error={error} onRetry={handleRetry} />
              </CardV2>
            )}
            {!isLoading && showResult && result && !error && (
              <div className="space-y-4">
                {/* Search interpretation - shown before answer panel */}
                {searchInterpretation && (
                  <AgentSearchInterpretation
                    interpretation={searchInterpretation}
                  />
                )}
                <AgentAnswerPanel result={result} onFeedback={handleFeedback} />
                {/* Related questions - shown after AI response is complete */}
                {relatedQuestions.length > 0 && (
                  <AgentRelatedQuestions
                    questions={relatedQuestions}
                    onSelectQuestion={handlePrefillQuery}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Category sidebar (desktop only sticky) */}
        <aside
          className="w-full shrink-0 lg:w-80"
          role="complementary"
          aria-label="カテゴリ別サンプル検索"
        >
          <div className="lg:sticky lg:top-4">
            <CardV2
              variant="default"
              className="bg-[var(--tt-color-surface-muted)] p-4 shadow-[var(--tt-shadow-card-rest)]"
            >
              <AgentSampleQueries
                layout="sidebar"
                onSelectQuery={handlePrefillQuery}
              />
            </CardV2>
          </div>
        </aside>
      </div>
    </div>
  );
}
