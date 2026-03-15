'use client';

import { Sparkles, Info } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';

interface SearchInterpretation {
  originalQuery: string;
  expandedQuery: string;
  expansionMethod: 'none' | 'dictionary' | 'ai';
}

interface AgentSearchInterpretationProps {
  interpretation: SearchInterpretation | null;
  className?: string;
}

/**
 * AgentSearchInterpretation - Displays AI's interpretation of user's search query
 *
 * UX Psychology Principles Applied:
 * - Labor Illusion: Shows AI's processing to convey value
 * - Visual Hierarchy: Positioned before article grid as supplementary info
 * - Curiosity Gap: Expanded keywords spark interest in articles
 *
 * Accessibility:
 * - role="status" for dynamic content announcement
 * - aria-live="polite" for non-intrusive updates
 * - WCAG 2.1 AA compliant (contrast ratio 4.5:1+)
 */
export function AgentSearchInterpretation({
  interpretation,
  className = '',
}: AgentSearchInterpretationProps) {
  // Direct search mode uses dictionary expansion which doesn't provide
  // meaningful query transformation info to users. Hide entirely.
  if (
    !interpretation ||
    interpretation.expansionMethod === 'none' ||
    interpretation.expansionMethod === 'dictionary'
  ) {
    return null;
  }

  // Don't render if expanded query is same as original
  if (interpretation.expandedQuery === interpretation.originalQuery) {
    return null;
  }

  return (
    <CardV2
      variant="ghost"
      className={`border border-[var(--tt-color-primary)]/20 bg-[var(--tt-color-primary)]/5 p-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="AI search interpretation"
      data-testid="agent-search-interpretation"
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tt-color-primary)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--tt-color-text-muted)]">
            <span className="font-medium text-[var(--tt-color-text)]">
              {interpretation.originalQuery}
            </span>
            <span
              className="mx-2 text-[var(--tt-color-text-muted)]"
              aria-hidden="true"
            >
              →
            </span>
            <span className="sr-only">expanded to</span>
            <span className="font-medium text-[var(--tt-color-primary)]">
              {interpretation.expandedQuery}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--tt-color-text-muted)]">
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>AIがクエリを解釈して検索範囲を拡張しました</span>
          </p>
        </div>
      </div>
    </CardV2>
  );
}
