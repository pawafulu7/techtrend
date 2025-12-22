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
  // Don't render if no interpretation or no expansion happened
  if (!interpretation || interpretation.expansionMethod === 'none') {
    return null;
  }

  // Don't render if expanded query is same as original
  if (interpretation.expandedQuery === interpretation.originalQuery) {
    return null;
  }

  const expansionLabel = interpretation.expansionMethod === 'ai' ? 'AI' : 'dictionary';

  return (
    <CardV2
      variant="ghost"
      className={`p-3 bg-[var(--tt-color-primary)]/5 border border-[var(--tt-color-primary)]/20 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="AI search interpretation"
      data-testid="agent-search-interpretation"
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className="h-4 w-4 text-[var(--tt-color-primary)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--tt-color-text-muted)]">
            <span className="font-medium text-[var(--tt-color-text)]">
              {interpretation.originalQuery}
            </span>
            <span className="mx-2 text-[var(--tt-color-text-muted)]" aria-hidden="true">
              →
            </span>
            <span className="sr-only">expanded to</span>
            <span className="font-medium text-[var(--tt-color-primary)]">
              {interpretation.expandedQuery}
            </span>
          </p>
          <p className="text-xs text-[var(--tt-color-text-muted)] mt-1 flex items-center gap-1">
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>
              {expansionLabel === 'ai'
                ? 'AIがクエリを解釈して検索範囲を拡張しました'
                : '関連キーワードで検索範囲を拡張しました'}
            </span>
          </p>
        </div>
      </div>
    </CardV2>
  );
}
