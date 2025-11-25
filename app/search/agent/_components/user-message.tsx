'use client';

import { CardV2 } from '@/components/ui-v2/card-v2';
import { cn } from '@/lib/utils';

interface UserMessageProps {
  /** The user's query text */
  query: string;
  /** Timestamp when the query was submitted */
  timestamp: Date;
  /** Whether this message is currently being processed */
  isStreaming?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays a user message in the conversation history
 *
 * Styled as a message bubble using CardV2 ghost variant.
 * - Desktop: Right-aligned, max 70% width
 * - Mobile: Full width, left-aligned
 *
 * @see UI/UX Review: .claude/docs/plan/20251125_161708_ai-search-multiturn_ui-ux-review/ui-ux-review.md
 */
export function UserMessage({
  query,
  timestamp,
  isStreaming = false,
  className,
}: UserMessageProps) {
  const formattedTime = timestamp.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <CardV2
      variant="ghost"
      className={cn(
        // Base styles
        'bg-[var(--tt-color-surface-muted)]',
        'w-full',
        // Desktop: right-aligned with max width
        'md:ml-auto md:max-w-[70%] md:w-auto',
        className
      )}
      aria-busy={isStreaming}
      data-testid="user-message"
    >
      <div className="p-3 md:p-4">
        <p className="text-sm md:text-base whitespace-pre-wrap break-words">
          {query}
        </p>
        <time
          dateTime={timestamp.toISOString()}
          className="block mt-2 text-xs text-[var(--tt-color-text-tertiary)]"
        >
          {formattedTime}
        </time>
      </div>
    </CardV2>
  );
}
