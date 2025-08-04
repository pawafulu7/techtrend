'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tag } from 'lucide-react';
import Link from 'next/link';

interface TagCloudProps {
  tags: { id: string; name: string; count: number }[];
}

export function TagCloud({ tags }: TagCloudProps) {
  if (tags.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            人気タグ
          </CardTitle>
          <CardDescription>記事数の多いタグ</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            タグがありません
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...tags.map(t => t.count));
  const minCount = Math.min(...tags.map(t => t.count));

  const getTagSize = (count: number) => {
    if (maxCount === minCount) return 'text-base';
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio > 0.8) return 'text-xl font-bold';
    if (ratio > 0.6) return 'text-lg font-semibold';
    if (ratio > 0.4) return 'text-base font-medium';
    if (ratio > 0.2) return 'text-sm';
    return 'text-xs';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          人気タグ
        </CardTitle>
        <CardDescription>記事数の多いタグ（TOP20）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}
              className="group"
            >
              <Badge
                variant="secondary"
                className={`${getTagSize(tag.count)} transition-all hover:bg-primary hover:text-primary-foreground cursor-pointer`}
              >
                {tag.name}
                <span className="ml-1 text-xs opacity-70">
                  ({tag.count})
                </span>
              </Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}