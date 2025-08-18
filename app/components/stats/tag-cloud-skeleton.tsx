'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function TagCloudSkeleton() {
  // ランダムな幅のタグを生成
  const generateRandomTags = () => {
    const widths = ['w-16', 'w-20', 'w-24', 'w-28', 'w-32', 'w-36', 'w-40'];
    const heights = ['h-6', 'h-7', 'h-8'];
    const tags = [];
    
    for (let i = 0; i < 30; i++) {
      tags.push({
        width: widths[Math.floor(Math.random() * widths.length)],
        height: heights[Math.floor(Math.random() * heights.length)],
      });
    }
    return tags;
  };

  const tags = generateRandomTags();

  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <div
              key={i}
              className={`${tag.height} ${tag.width} bg-gray-200 dark:bg-gray-700 rounded-full`}
              style={{
                animationDelay: `${i * 30}ms`,
                opacity: 0.3 + Math.random() * 0.7,
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}