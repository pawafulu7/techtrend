'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ButtonV2 } from '@/components/ui-v2/button-v2';

interface SourceReferencesProps {
  totalTokens?: number;
  resultQuery?: string;
  onFeedback?: (positive: boolean) => void;
}

export function SourceReferences({
  totalTokens,
  resultQuery,
  onFeedback,
}: SourceReferencesProps) {
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<
    'positive' | 'negative' | null
  >(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [prevQuery, setPrevQuery] = useState(resultQuery);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset feedback state when result changes (React recommended pattern)
  if (prevQuery !== resultQuery) {
    setPrevQuery(resultQuery);
    setFeedbackSubmitted(null);
    setIsSubmittingFeedback(false);
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  // Debounced feedback handler
  const handleFeedback = useCallback(
    (positive: boolean) => {
      if (isSubmittingFeedback || feedbackSubmitted) return;
      setIsSubmittingFeedback(true);
      setFeedbackSubmitted(positive ? 'positive' : 'negative');
      onFeedback?.(positive);
      // Reset submitting state after short delay (for visual feedback)
      feedbackTimeoutRef.current = setTimeout(
        () => setIsSubmittingFeedback(false),
        300
      );
    },
    [isSubmittingFeedback, feedbackSubmitted, onFeedback]
  );

  if (!totalTokens && !onFeedback) return null;

  return (
    <div className="mt-4 flex items-center justify-between border-t pt-4">
      <div className="text-muted-foreground text-xs">
        {typeof totalTokens === 'number' && (
          <span>トークン使用: {totalTokens.toLocaleString()}</span>
        )}
      </div>

      {onFeedback && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--tt-color-surface-muted)] p-2">
          {feedbackSubmitted ? (
            <div
              className="flex items-center gap-2 text-sm"
              data-testid="feedback-thanks"
            >
              <CheckCircle2
                className="h-4 w-4 text-[var(--tt-color-primary)]"
                aria-hidden="true"
              />
              <span className="text-[var(--tt-color-text-muted)]">
                フィードバックありがとうございます
              </span>
            </div>
          ) : (
            <>
              <span className="text-muted-foreground mr-2 hidden text-xs sm:inline">
                この回答は役立ちましたか？
              </span>
              <ButtonV2
                variant="ghost"
                size="sm"
                onClick={() => handleFeedback(true)}
                disabled={isSubmittingFeedback}
                className="h-11 w-11 hover:bg-[var(--tt-color-primary)]/10 hover:text-[var(--tt-color-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:w-9"
                aria-label="役立った"
                data-testid="feedback-positive"
              >
                <ThumbsUp className="h-5 w-5 md:h-4 md:w-4" />
              </ButtonV2>
              <ButtonV2
                variant="ghost"
                size="sm"
                onClick={() => handleFeedback(false)}
                disabled={isSubmittingFeedback}
                className="h-11 w-11 hover:bg-[var(--tt-color-negative)]/10 hover:text-[var(--tt-color-negative)] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:w-9"
                aria-label="改善が必要"
                data-testid="feedback-negative"
              >
                <ThumbsDown className="h-5 w-5 md:h-4 md:w-4" />
              </ButtonV2>
            </>
          )}
        </div>
      )}
    </div>
  );
}
