'use client';

import { Share2, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ShareButtonProps {
  title: string;
  url: string;
  size?: 'sm' | 'default';
  variant?: 'ghost' | 'outline' | 'default';
}

export function ShareButton({ title, url, size = 'sm', variant = 'ghost' }: ShareButtonProps) {
  const handleTwitterShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tweetText = encodeURIComponent(title);
    const tweetUrl = encodeURIComponent(url);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=550,height=400');
  };

  const handleHatenaShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hatenaUrl = `https://b.hatena.ne.jp/entry/${encodeURIComponent(url)}`;
    window.open(hatenaUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="h-6 px-2 text-xs hover:bg-secondary"
          title="記事を共有"
          onClick={(e) => e.stopPropagation()}
          data-testid="share-button"
        >
          <Share2 className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs">記事を共有</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleTwitterShare} className="cursor-pointer">
          <Twitter className="h-3 w-3 mr-2" />
          <span className="text-xs">Twitterで共有</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleHatenaShare} className="cursor-pointer">
          <svg
            className="h-3 w-3 mr-2"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M20.47 0C22.42 0 24 1.58 24 3.53v16.94c0 1.95-1.58 3.53-3.53 3.53H3.53C1.58 24 0 22.42 0 20.47V3.53C0 1.58 1.58 0 3.53 0h16.94zm-3.705 14.47c-.78 0-1.41.63-1.41 1.41s.63 1.41 1.41 1.41 1.41-.63 1.41-1.41-.63-1.41-1.41-1.41zM8.61 17.247c1.2 0 2.056-.042 2.58-.12.526-.084.976-.222 1.32-.412.45-.246.78-.564 1.02-.954s.36-.87.36-1.41c0-.78-.21-1.42-.63-1.92-.42-.48-1.05-.768-1.89-.828v-.06c.66-.18 1.14-.456 1.44-.84.294-.384.45-.894.45-1.53 0-.48-.12-.9-.354-1.236a2.17 2.17 0 0 0-.936-.756c-.384-.168-.834-.3-1.332-.384-.504-.084-1.328-.126-2.472-.126H5.18v11.58H8.61zm-.846-6.854h1.44c.732 0 1.242.096 1.524.288.282.192.426.498.426.912 0 .432-.156.738-.462.924-.312.18-.822.276-1.536.276H7.764v-2.4zm0 4.596h1.668c.78 0 1.326.102 1.638.3.312.204.468.534.468.996 0 .456-.162.786-.486.984-.324.204-.876.3-1.65.3H7.764v-2.58z" />
          </svg>
          <span className="text-xs">はてなブックマーク</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}