'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, Search, FileText } from 'lucide-react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentSampleQueries } from './agent-sample-queries';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { AgentStepIndicator } from './agent-step-indicator';
import { AgentRelatedQuestions, generateRelatedQuestions } from './agent-related-questions';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import { CardV2 } from '@/components/ui-v2/card-v2';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

// Timeout threshold for "still processing" message (30 seconds)
const STEP_TIMEOUT_MS = 30000;

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isStepTimedOut, setIsStepTimedOut] = useState(false);
  const { search, result, error, isLoading, partialText, currentStep, reset } = useAgentSearch();
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);

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

  // 初回訪問判定（検索未実行かつ結果なし）
  const isInitialState = !lastQuery && !result && !error && !isLoading;

  // Generate related questions based on AI response
  const relatedQuestions = useMemo(() => {
    if (!result?.response) return [];
    return generateRelatedQuestions(result.response, result.articles);
  }, [result?.response, result?.articles]);

  return (
    <div>
      <CardV2
        variant="default"
        className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-6 mb-6"
        data-testid="agent-search-card"
      >
        <div className="mb-6">
          <div className="border-l-4 border-[var(--tt-color-primary)] pl-4 mb-4">
            <h1 className="text-3xl md:text-4xl font-heading mb-2 bg-gradient-to-r from-[var(--tt-color-primary)] to-[var(--tt-color-secondary)] bg-clip-text text-transparent">
              AI記事検索
            </h1>
            <p className="text-sm text-[color:var(--tt-color-text-muted)]">
              AIがTechTrendの記事を横断検索し、要約と参考リンクで回答します。
            </p>
          </div>
          <p className="text-center text-sm text-[color:var(--tt-color-text-muted)]">
            気になるテーマを自然言語で質問してください。
          </p>
        </div>

        <AgentSearchBar
          onSearch={handleSearch}
          isLoading={isLoading}
          onPrefillQuery={handleSetPrefillCallback}
        />
      </CardV2>

      {/* カテゴリタイルグリッド - 常時表示でナッジ効果を活用 */}
      <section className="mt-6" aria-labelledby="sample-queries-heading">
        <h2 id="sample-queries-heading" className="text-center text-sm font-medium text-[var(--tt-color-text-muted)] mb-4">
          カテゴリから探す
        </h2>
        <AgentSampleQueries onSelectQuery={handlePrefillQuery} />
      </section>

      <div className="mt-8">
        {/* 初回訪問時のガイダンス */}
        {isInitialState && (
          <CardV2
            variant="ghost"
            className="py-8 text-center"
            role="status"
            aria-live="polite"
            data-testid="agent-initial-state"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-6 text-[var(--tt-color-text-muted)]">
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-[var(--tt-color-primary)]/10">
                    <Search className="h-5 w-5 text-[var(--tt-color-primary)]" aria-hidden="true" />
                  </div>
                  <span className="text-xs">質問を入力</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-[var(--tt-color-primary)]/10">
                    <Sparkles className="h-5 w-5 text-[var(--tt-color-primary)]" aria-hidden="true" />
                  </div>
                  <span className="text-xs">AIが検索</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-[var(--tt-color-primary)]/10">
                    <FileText className="h-5 w-5 text-[var(--tt-color-primary)]" aria-hidden="true" />
                  </div>
                  <span className="text-xs">要約を回答</span>
                </div>
              </div>
              <p className="text-sm text-[var(--tt-color-text-muted)] max-w-md">
                上の検索バーにキーワードを入力するか、カテゴリから選んで検索を開始してください
              </p>
            </div>
          </CardV2>
        )}

        {isLoading && !isStreamingWithPartialText && (
          <div className="py-8" data-testid="agent-loading-wrapper">
            <AgentStepIndicator
              currentStep={currentStep}
              isTimedOut={isStepTimedOut}
              className="mb-6"
            />
            <AgentLoadingState />
          </div>
        )}
        {!isLoading && showResult && error && <AgentErrorDisplay error={error} onRetry={handleRetry} />}
        {showResult && (result || isStreamingWithPartialText) && !error && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
