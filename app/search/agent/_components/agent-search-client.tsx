'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentSampleQueries } from './agent-sample-queries';
import { ConversationHistory } from './conversation-history';
import { useAgentSearch, type ChatMessage } from '@/lib/hooks/useAgentSearch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import type { ConversationTurn } from '../types';
import { MAX_CONVERSATION_TURNS } from '../types';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

export function AgentSearchClient() {
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const { search, result, error, isLoading, partialText, reset } = useAgentSearch();
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);
  const focusSearchInputRef = useRef<(() => void) | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  /**
   * Build ChatMessage array from conversation history for API request
   */
  const buildMessagesFromHistory = useCallback(
    (newQuery: string): ChatMessage[] => {
      const messages: ChatMessage[] = [];

      // Add previous turns (excluding error turns)
      for (const turn of conversationHistory) {
        if (turn.error) continue; // Skip error turns
        messages.push({ role: 'user', content: turn.query });
        if (turn.result?.response) {
          messages.push({ role: 'assistant', content: turn.result.response });
        }
      }

      // Add new user query
      messages.push({ role: 'user', content: newQuery });

      return messages;
    },
    [conversationHistory]
  );

  const handleSearch = async (query: string) => {
    // Create new turn
    const turnId = crypto.randomUUID();
    const newTurn: ConversationTurn = {
      id: turnId,
      query,
      result: null,
      error: null,
      timestamp: new Date(),
    };

    // Add to history with trim (keep max turns)
    setConversationHistory((prev) => {
      const updated = [...prev, newTurn];
      // Trim oldest turns if exceeding max
      if (updated.length > MAX_CONVERSATION_TURNS) {
        return updated.slice(updated.length - MAX_CONVERSATION_TURNS);
      }
      return updated;
    });

    setCurrentTurnId(turnId);
    reset();

    // Build messages array from history for multi-turn context
    const messages = buildMessagesFromHistory(query);

    // Use single query for first message (backward compat), messages array for multi-turn
    if (messages.length === 1) {
      await search(query);
    } else {
      await search(messages);
    }
  };

  // Update conversation history when result or error arrives
  useEffect(() => {
    if (!currentTurnId) return;
    if (!result && !error) return;

    setConversationHistory((prev) =>
      prev.map((turn) =>
        turn.id === currentTurnId
          ? { ...turn, result: result ?? turn.result, error: error ?? turn.error }
          : turn
      )
    );

    // Clear current turn when complete
    if (!isLoading) {
      setCurrentTurnId(null);
    }
  }, [result, error, currentTurnId, isLoading]);


  // Auto-scroll to latest message
  useEffect(() => {
    if (conversationHistory.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory.length, partialText]);

  /**
   * Retry a failed turn
   */
  const handleRetry = useCallback(
    (turnId: string) => {
      const turn = conversationHistory.find((t) => t.id === turnId);
      if (!turn) return;

      // Remove the failed turn and retry with same query
      setConversationHistory((prev) => prev.filter((t) => t.id !== turnId));

      // Re-search with the same query (will create new turn)
      handleSearch(turn.query);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSearch is stable
    [conversationHistory]
  );

  /**
   * Start a new conversation (clear history)
   */
  const handleNewConversation = useCallback(() => {
    setConversationHistory([]);
    setCurrentTurnId(null);
    reset();
  }, [reset]);

  // Feedback handler for future use
  const _handleFeedback = (positive: boolean) => {
    const lastTurn = conversationHistory[conversationHistory.length - 1];
    console.log('[Feedback]', positive ? 'positive' : 'negative', 'for query:', result?.query || lastTurn?.query);
  };
  void _handleFeedback; // Suppress unused warning

  const handlePrefillQuery = useCallback((query: string) => {
    if (prefillQueryRef.current) {
      prefillQueryRef.current(query);
    }
  }, []);

  const handleSetPrefillCallback = useCallback((callback: (query: string) => void) => {
    prefillQueryRef.current = callback;
  }, []);

  const handleSetFocusCallback = useCallback((focusFn: () => void) => {
    focusSearchInputRef.current = focusFn;
  }, []);

  // Restore focus to search input after response completes
  useEffect(() => {
    if (!isLoading && (result || error) && currentTurnId === null) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        focusSearchInputRef.current?.();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, result, error, currentTurnId]);


  return (
    <div className="flex flex-col min-h-[60vh]">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold">AI記事検索</h1>
      </div>

      {/* New Conversation Button - shown when history exists */}
      {conversationHistory.length > 0 && (
        <div className="mb-4 flex justify-end">
          <ButtonV2
            variant="outline"
            size="sm"
            onClick={handleNewConversation}
            className="gap-2"
            data-testid="new-conversation-button"
          >
            <RotateCcw className="h-4 w-4" />
            <span>新しい会話を始める</span>
          </ButtonV2>
        </div>
      )}

      {/* Conversation History - grows to fill space */}
      <div className="flex-1 mb-6 pb-20">
        {conversationHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)] p-6 text-sm text-[var(--tt-color-text-muted)] text-center">
            質問を入力すると、ここに会話履歴が表示されます。
          </div>
        ) : (
          <ConversationHistory
            turns={conversationHistory}
            currentTurnId={currentTurnId}
            partialText={ENABLE_STREAMING_UI ? partialText : null}
            isStreaming={isLoading}
            onRetry={handleRetry}
          />
        )}
        {/* Scroll anchor */}
        <div ref={conversationEndRef} />
      </div>

      {/* Input Area - sticky at bottom */}
      <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--tt-color-surface)] via-[var(--tt-color-surface)] to-transparent pt-4 pb-2">
        <CardV2
          variant="default"
          className="bg-[var(--tt-color-surface-muted)] shadow-[var(--tt-shadow-card-rest)] p-4 md:p-6"
          data-testid="agent-search-card"
        >
          <AgentSearchBar
            onSearch={handleSearch}
            isLoading={isLoading}
            onPrefillQuery={handleSetPrefillCallback}
            onFocusRef={handleSetFocusCallback}
            conversationTurns={conversationHistory.length}
          />

          <Collapsible className="mt-4">
            <CollapsibleTrigger asChild>
              <ButtonV2
                variant="ghost"
                size="sm"
                className="w-full justify-center gap-2 data-[state=open]:text-primary"
                data-testid="agent-sample-query-trigger"
              >
                <span className="text-sm">よくある質問を見る</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
              </ButtonV2>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <AgentSampleQueries onSelectQuery={handlePrefillQuery} />
            </CollapsibleContent>
          </Collapsible>
        </CardV2>
      </div>
    </div>
  );
}
