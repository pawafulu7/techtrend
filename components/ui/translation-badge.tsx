import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { cn } from '@/lib/utils';

interface TranslationBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
  /**
   * 一覧のメタ行に置く小さい形。縦の余白をなくし、行の高さを親の文字に合わせて
   * 行を高くしない。幅が足りないときはソース名の方を省略させる
   */
  compact?: boolean;
}

/**
 * TranslationBadge - Displays a badge indicating the article is auto-translated
 *
 * Usage: Show this badge when article.translatedTitle exists
 * Example: {article.translatedTitle && <TranslationBadge />}
 */
export function TranslationBadge({
  className,
  compact = false,
  ...props
}: TranslationBadgeProps) {
  return (
    <BadgeV2
      variant="outline"
      className={cn(
        'text-xs',
        'border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)] text-[var(--tt-color-info)] hover:bg-[var(--tt-color-info-bg)]',
        // 枠線の上下 1px は負のマージンで打ち消す
        compact && '-my-px shrink-0 px-1.5 py-0 leading-[inherit]',
        className
      )}
      aria-label="この記事は英語から自動翻訳されています"
      title="この記事は英語から自動翻訳されています"
      data-testid="translation-badge"
      {...props}
    >
      自動翻訳
    </BadgeV2>
  );
}
