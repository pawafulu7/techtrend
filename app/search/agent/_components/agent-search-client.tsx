'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { AgentSearchBar } from './agent-search-bar';
import { AgentSampleQueries } from './agent-sample-queries';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { AgentStepIndicator } from './agent-step-indicator';
import { AgentRelatedQuestions, generateRelatedQuestions } from './agent-related-questions';
import { AgentSearchInterpretation } from './agent-search-interpretation';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import { CardV2 } from '@/components/ui-v2/card-v2';

// Schema for semantic-search tool output validation
const SemanticSearchOutputSchema = z.object({
  originalQuery: z.string(),
  expandedQuery: z.string(),
  expansionMethod: z.enum(['none', 'dictionary', 'ai']),
});

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

// Timeout threshold for "still processing" message (30 seconds)
const STEP_TIMEOUT_MS = 30000;

// Hook for reduced motion preference - reacts to system setting changes
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
};

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const prefersReducedMotion = usePrefersReducedMotion();
  const [showResult, setShowResult] = useState(false);
  const [isStepTimedOut, setIsStepTimedOut] = useState(false);
  const { search, result, error, isLoading, partialText, currentStep, reset } = useAgentSearch();
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    setShowResult(false);
    setIsStepTimedOut(false);
    reset();
    await search(query);
  };

  // Step timeout effect - show "still processing" after 30 seconds
  useEffect(() => {
    if (currentStep === 'idle' || currentStep === 'complete' || currentStep === 'error') {
      setIsStepTimedOut(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsStepTimedOut(true);
    }, STEP_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [currentStep]);

  useEffect(() => {
    if (!ENABLE_STREAMING_UI) return;
    if (!partialText) return;
    setShowResult(true);
  }, [partialText]);

  useEffect(() => {
    if (!isLoading && (result || error)) {
      if (ENABLE_STREAMING_UI) {
        setShowResult(true);
        return;
      }

      const timer = setTimeout(() => {
        setShowResult(true);
      }, 300);

      return () => clearTimeout(timer);
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
    console.log('[Feedback]', positive ? 'positive' : 'negative', 'for query:', result?.query || lastQuery);
  };

  const handlePrefillQuery = useCallback((query: string) => {
    if (prefillQueryRef.current) {
      prefillQueryRef.current(query);
    }
  }, []);

  const handleSetPrefillCallback = useCallback((callback: (query: string) => void) => {
    prefillQueryRef.current = callback;
  }, []);

  const isStreamingWithPartialText = ENABLE_STREAMING_UI && Boolean(partialText);
  const shouldShowStreamingResult = ENABLE_STREAMING_UI && Boolean(partialText && !result);

  // Generate related questions based on AI response
  const relatedQuestions = useMemo(() => {
    if (!result?.response) return [];
    return generateRelatedQuestions(result.response, result.articles);
  }, [result?.response, result?.articles]);

  // Extract search interpretation from tool calls (semantic-search output)
  // Uses Zod schema validation for runtime type safety
  const searchInterpretation = useMemo(() => {
    if (!result?.toolCalls) return null;

    // Find semantic-search tool call
    const semanticSearchCall = result.toolCalls.find(
      (tc) => tc.name === 'semantic-search' && tc.output
    );

    if (!semanticSearchCall?.output) return null;

    // Validate output with Zod schema for runtime type safety
    const parsed = SemanticSearchOutputSchema.safeParse(semanticSearchCall.output);
    if (!parsed.success) return null;

    return {
      originalQuery: parsed.data.originalQuery,
      expandedQuery: parsed.data.expandedQuery,
      expansionMethod: parsed.data.expansionMethod,
    };
  }, [result?.toolCalls]);

  return (
    <div className="w-full px-6 py-3">
      {/* 2-column layout: Main content (left) + Sidebar (right) */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column: Search bar + Results */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Search card */}
          <CardV2
            variant="default"
            className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-4"
            data-testid="agent-search-card"
          >
            <div className="mb-3">
              <div className="border-l-4 border-[var(--tt-color-primary)] pl-3">
                <h1 className="text-lg md:text-xl font-heading mb-0.5 text-[var(--tt-color-text)]">
                  AI記事検索
                </h1>
                <p className="text-sm text-[color:var(--tt-color-text-muted)]">
                  自然言語で質問すると、AIが記事を横断検索して要約回答します
                </p>
              </div>
            </div>

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
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:px-4 focus:py-2 focus:bg-[var(--tt-color-primary)] focus:text-white focus:rounded"
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
            {isLoading && !isStreamingWithPartialText && (
              <CardV2
                variant="default"
                className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-6"
                data-testid="agent-loading-wrapper"
              >
                <AgentStepIndicator
                  currentStep={currentStep}
                  isTimedOut={isStepTimedOut}
                  className="mb-6"
                />
                <AgentLoadingState />
              </CardV2>
            )}
            {!isLoading && showResult && error && (
              <CardV2
                variant="default"
                className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-6"
              >
                <AgentErrorDisplay error={error} onRetry={handleRetry} />
              </CardV2>
            )}
            {showResult && (result || isStreamingWithPartialText) && !error && (
              <div className="space-y-4">
                {/* Search interpretation - shown before answer panel */}
                {result && searchInterpretation && (
                  <AgentSearchInterpretation interpretation={searchInterpretation} />
                )}
                <AgentAnswerPanel
                  result={result}
                  partialText={ENABLE_STREAMING_UI ? partialText : null}
                  isStreaming={shouldShowStreamingResult}
                  onFeedback={handleFeedback}
                />
                {/* Related questions - shown after AI response is complete */}
                {result && relatedQuestions.length > 0 && (
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
          className="w-full lg:w-80 shrink-0"
          role="complementary"
          aria-label="カテゴリ別サンプル検索"
        >
          <div className="lg:sticky lg:top-4">
            <CardV2
              variant="default"
              className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-4"
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
