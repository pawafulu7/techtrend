'use client';

import { cn } from '@/lib/utils';
import type { ConversationTurn } from '../types';
import { UserMessage } from './user-message';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { AgentLoadingState } from './agent-loading-state';

interface ConversationHistoryProps {
  /** Array of conversation turns to display */
  turns: ConversationTurn[];
  /** ID of the currently active turn (if streaming) */
  currentTurnId: string | null;
  /** Partial text for the current streaming response */
  partialText: string | null;
  /** Whether currently streaming a response */
  isStreaming: boolean;
  /** Callback when retry is requested for an error */
  onRetry?: (turnId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays the conversation history between user and AI
 *
 * Renders a list of conversation turns, each consisting of:
 * - UserMessage: The user's query
 * - AgentAnswerPanel/AgentErrorDisplay/AgentLoadingState: The AI's response
 *
 * Accessibility:
 * - role="log" for screen reader announcement
 * - aria-live="polite" for dynamic updates
 * - aria-busy during streaming
 *
 * @see UI/UX Review: .claude/docs/plan/20251125_161708_ai-search-multiturn_ui-ux-review/ui-ux-review.md
 */
export function ConversationHistory({
  turns,
  currentTurnId,
  partialText,
  isStreaming,
  onRetry,
  className,
}: ConversationHistoryProps) {
  if (turns.length === 0) {
    return null;
  }

  return (
    <div
      role="log"
      aria-live="polite"
      aria-busy={isStreaming}
      aria-label="AI conversation history"
      className={cn('space-y-4 md:space-y-6', className)}
      data-testid="conversation-history"
    >
      {turns.map((turn, index) => {
        const isCurrentTurn = turn.id === currentTurnId;
        const isLastTurn = index === turns.length - 1;
        const showLoading = isCurrentTurn && isStreaming && !turn.result && !turn.error && !partialText;

        return (
          <div
            key={turn.id}
            className="space-y-3 md:space-y-4"
            data-testid={`conversation-turn-${turn.id}`}
          >
            {/* User message */}
            <UserMessage
              query={turn.query}
              timestamp={turn.timestamp}
              isStreaming={isCurrentTurn && isStreaming}
            />

            {/* AI response */}
            {turn.error ? (
              <AgentErrorDisplay
                error={turn.error}
                onRetry={onRetry ? () => onRetry(turn.id) : undefined}
              />
            ) : showLoading ? (
              <AgentLoadingState />
            ) : (
              <AgentAnswerPanel
                result={turn.result}
                partialText={isCurrentTurn ? partialText : null}
                isStreaming={isCurrentTurn && isStreaming}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
