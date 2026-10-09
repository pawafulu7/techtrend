import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';

// 記事詳細の「元記事を読む」。タイトルの下（主）とカード末尾（outline）で使う
export function ReadOriginalLink({
  url,
  variant = 'default',
}: {
  url: string;
  variant?: 'default' | 'outline';
}) {
  return (
    <Button variant={variant} asChild>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        元記事を読む
      </a>
    </Button>
  );
}
