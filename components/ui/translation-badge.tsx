import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { cn } from '@/lib/utils';

interface TranslationBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
}

/**
 * TranslationBadge - Displays a badge indicating the article is auto-translated
 *
 * Usage: Show this badge when article.translatedTitle exists
 * Example: {article.translatedTitle && <TranslationBadge />}
 */
export function TranslationBadge({
  className,
  ...props
}: TranslationBadgeProps) {
  return (
    <BadgeV2
      variant="outline"
      className={cn(
        'text-xs',
        'border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)] text-[var(--tt-color-info)] hover:bg-[var(--tt-color-info-bg)]',
        className
      )}
      aria-label="この記事は英語から自動翻訳されています"
      title="この記事は英語から自動翻訳されています"
      {...props}
    >
      自動翻訳
    </BadgeV2>
  );
}
