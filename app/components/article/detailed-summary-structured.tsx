'use client';

import { parseSummary } from '@/lib/utils/summary-parser';
import { ArticleType } from '@/lib/utils/article-type-detector';

interface DetailedSummaryStructuredProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number | string | null;
}

export function DetailedSummaryStructured({
  detailedSummary,
  articleType,
  summaryVersion
}: DetailedSummaryStructuredProps) {
  const parsedSummaryVersion =
    typeof summaryVersion === 'number'
      ? summaryVersion
      : typeof summaryVersion === 'string'
        ? Number.parseInt(summaryVersion, 10)
        : undefined;
  const normalizedSummaryVersion =
    typeof parsedSummaryVersion === 'number' && Number.isFinite(parsedSummaryVersion)
      ? parsedSummaryVersion
      : undefined;

  const sections = parseSummary(detailedSummary, {
    articleType,
    summaryVersion: normalizedSummaryVersion,
  });

  // Fallback for parse failure
  if (sections.length === 0) {
    return (
      <div
        className="p-[var(--tt-space-5)] bg-card text-card-foreground rounded-[var(--tt-radius-xl)] shadow-[var(--tt-shadow-card-rest)] border border-foreground/10"
        data-testid="detailed-summary-fallback"
      >
        <p className="text-[var(--tt-text-sm)] font-[var(--tt-font-heading)] font-semibold mb-[var(--tt-space-3)] tracking-[var(--tt-tracking-tight)]">
          詳細要約
        </p>
        <div className="text-[var(--tt-text-sm)] font-[var(--tt-font-body)] text-card-foreground/80 whitespace-pre-wrap leading-[var(--tt-leading-relaxed)]">
          {detailedSummary}
        </div>
      </div>
    );
  }

  return (
    <section
      className="p-4 bg-slate-100/40 dark:bg-slate-900/30 text-foreground rounded-xl"
      aria-label="詳細要約"
      data-testid="detailed-summary-container"
    >
      <h3 className="text-[var(--tt-text-sm)] font-[var(--tt-font-heading)] font-semibold mb-[var(--tt-space-4)] tracking-[var(--tt-tracking-tight)]">
        詳細要約
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sections.map((section, index) => {
          const isEven = index % 2 === 0;
          const accentColor = isEven ? 'var(--tt-color-primary)' : 'var(--tt-color-secondary)';

          return (
            <article
              key={index}
              className="group space-y-2 rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200/60 dark:border-slate-700/60 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 min-h-[44px] motion-safe:opacity-0 motion-safe:animate-[fadeInUp_0.4s_ease_forwards]"
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: accentColor,
                animationDelay: `${index * 60}ms`,
              }}
              data-testid={`detailed-summary-section-${index}`}
            >

              <h4 className="text-sm font-[var(--tt-font-heading)] font-semibold tracking-[var(--tt-tracking-tight)] flex items-center gap-2">
                <span
                  className="text-lg flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-muted/60 group-hover:bg-muted transition-colors duration-200"
                  aria-hidden="true"
                >
                  {section.icon}
                </span>
                <span className="flex-1 line-clamp-1" title={section.title}>{section.title}</span>
              </h4>

              <div className="text-sm font-[var(--tt-font-body)] text-slate-700 dark:text-slate-200 leading-relaxed space-y-1">
                {section.content.split('\n').map((line, lineIndex) => (
                  <p key={lineIndex}>
                    {highlightContent(line)}
                  </p>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Highlight important parts of the content
function highlightContent(content: string): React.ReactNode {
  // Important keyword patterns with text decoration for WCAG 1.4.1 compliance
  const patterns = [
    { regex: /問題は(.+?)である/g, style: 'font-semibold text-destructive underline decoration-wavy decoration-1' },
    { regex: /解決策は(.+?)である/g, style: 'font-semibold text-primary underline decoration-2' },
    { regex: /効果は(.+?)である/g, style: 'font-semibold text-green-800 dark:text-green-500 underline decoration-dotted decoration-1' },
    { regex: /注意点は(.+?)である/g, style: 'font-semibold text-orange-700 dark:text-orange-500 underline decoration-dashed decoration-1' }
  ];

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const matches: { start: number; end: number; text: string; style: string }[] = [];

  // Collect all matches
  patterns.forEach(({ regex, style }) => {
    const regexCopy = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = regexCopy.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        style
      });
    }
  });

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Split text and highlight
  matches.forEach((match, index) => {
    // Skip overlapping matches
    if (match.start < lastIndex) {
      return;
    }

    // Text before match
    if (match.start > lastIndex) {
      parts.push(content.substring(lastIndex, match.start));
    }

    // Highlighted text
    parts.push(
      <span key={index} className={match.style}>
        {match.text}
      </span>
    );

    lastIndex = match.end;
  });

  // Last part
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}
