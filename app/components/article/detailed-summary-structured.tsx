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
      className="p-[var(--tt-space-5)] bg-card text-card-foreground rounded-[var(--tt-radius-xl)] shadow-[var(--tt-shadow-card-rest)] hover:shadow-[var(--tt-shadow-card-hover)] transition-shadow duration-200 border border-foreground/10"
      aria-label="詳細要約"
      data-testid="detailed-summary-container"
    >
      <h3 className="text-[var(--tt-text-sm)] font-[var(--tt-font-heading)] font-semibold mb-[var(--tt-space-4)] tracking-[var(--tt-tracking-tight)]">
        詳細要約
      </h3>
      <div className="space-y-[var(--tt-space-4)]">
        {sections.map((section, index) => {
          const isEven = index % 2 === 0;
          const accentColor = isEven ? 'var(--tt-color-primary)' : 'var(--tt-color-secondary)';

          return (
            <article
              key={index}
              className="group relative pl-[var(--tt-space-4)] md:pl-[var(--tt-space-5)] pb-[var(--tt-space-2)] space-y-[var(--tt-space-2)] rounded-[var(--tt-radius-lg)] transition-colors duration-200 hover:bg-[var(--tt-color-surface-hover)]/50 min-h-[44px] motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-reduce:animate-none"
              style={{
                borderLeftWidth: '2px',
                borderLeftColor: accentColor,
                animationDelay: `${index * 60}ms`,
                opacity: 0,
              }}
              data-testid={`detailed-summary-section-${index}`}
            >
              {/* Timeline dot - adjusted for mobile */}
              <span
                className="absolute left-[-4px] md:left-[-5px] top-[var(--tt-space-3)] h-[10px] w-[10px] rounded-full border-2 border-card"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />

              <h4 className="text-[var(--tt-text-sm)] md:text-[var(--tt-text-base)] font-[var(--tt-font-heading)] font-semibold tracking-[var(--tt-tracking-tight)] flex items-center gap-[var(--tt-space-3)]">
                <span
                  className="text-xl md:text-2xl flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 group-hover:bg-muted transition-colors duration-200"
                  aria-hidden="true"
                >
                  {section.icon}
                </span>
                <span className="flex-1">{section.title}</span>
              </h4>

              <div className="text-[var(--tt-text-sm)] font-[var(--tt-font-body)] text-card-foreground/80 leading-[var(--tt-leading-relaxed)] space-y-[var(--tt-space-2)] pl-[calc(var(--tt-space-8)+var(--tt-space-3))]">
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
    { regex: /\u554f\u984c\u306f(.+?)\u3067\u3042\u308b/g, style: 'font-semibold text-destructive underline decoration-wavy decoration-1' },
    { regex: /\u89e3\u6c7a\u7b56\u306f(.+?)\u3067\u3042\u308b/g, style: 'font-semibold text-primary underline decoration-2' },
    { regex: /\u52b9\u679c\u306f(.+?)\u3067\u3042\u308b/g, style: 'font-semibold text-green-800 dark:text-green-500 underline decoration-dotted decoration-1' },
    { regex: /\u6ce8\u610f\u70b9\u306f(.+?)\u3067\u3042\u308b/g, style: 'font-semibold text-orange-700 dark:text-orange-500 underline decoration-dashed decoration-1' }
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
