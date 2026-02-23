'use client';

import { Calendar, Clock, Tag } from 'lucide-react';

export function ArticleSkeleton() {
  const titlePatterns = [
    { line1: 'w-full', line2: 'w-4/5' },
    { line1: 'w-5/6', line2: 'w-full' },
    { line1: 'w-full', line2: 'w-3/4' },
    { line1: 'w-4/5', line2: 'w-5/6' },
    { line1: 'w-full', line2: 'w-2/3' },
    { line1: 'w-3/4', line2: 'w-full' },
  ];

  const tagPatterns = [
    ['w-16', 'w-20', 'w-14'],
    ['w-24', 'w-16', 'w-18'],
    ['w-14', 'w-28', 'w-16'],
    ['w-20', 'w-16', 'w-20'],
    ['w-18', 'w-24', 'w-14'],
    ['w-16', 'w-20', 'w-22'],
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface)"
        >
          {/* Shimmer effect */}
          <div
            className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            style={{ animationDelay: `${i * 100}ms` }}
          />

          <div className="px-3 pt-3 pb-1 sm:px-4">
            {/* Badge skeleton */}
            <div className="mb-2 flex items-center gap-1">
              <div className="bg-muted h-5 w-16 animate-pulse rounded" />
            </div>

            {/* Title skeleton */}
            <div className="space-y-2">
              <div
                className={`bg-muted h-5 animate-pulse rounded ${titlePatterns[i % 6]?.line1 || 'w-full'}`}
              />
              <div
                className={`bg-muted h-5 animate-pulse rounded ${titlePatterns[i % 6]?.line2 || 'w-4/5'}`}
              />
            </div>

            {/* Meta info skeleton */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Calendar className="text-muted-foreground/30 h-3 w-3" />
                <div className="bg-muted h-4 w-20 animate-pulse rounded" />
              </div>
              <div className="flex items-center gap-1">
                <Clock className="text-muted-foreground/30 h-3 w-3" />
                <div className="bg-muted h-4 w-16 animate-pulse rounded" />
              </div>
            </div>
          </div>

          <div className="space-y-3 px-3 py-2 sm:px-4">
            {/* Summary skeleton */}
            <div className="relative pl-3">
              <div className="bg-muted absolute top-0 bottom-0 left-0 w-0.5 animate-pulse rounded-full" />
              <div className="space-y-2">
                <div className="bg-muted h-4 animate-pulse rounded" />
                <div className="bg-muted h-4 animate-pulse rounded" />
                <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
              </div>
            </div>

            {/* Tags skeleton */}
            <div className="flex items-center gap-1">
              <Tag className="text-muted-foreground/30 h-3 w-3" />
              {(tagPatterns[i % 6] || ['w-16', 'w-20', 'w-14']).map(
                (width, idx) => (
                  <div
                    key={idx}
                    className={`bg-muted h-5 rounded-full ${width} animate-pulse`}
                  />
                )
              )}
            </div>

            {/* Action buttons skeleton */}
            <div className="flex items-center justify-between pt-1">
              <div className="bg-muted h-6 w-20 animate-pulse rounded" />
              <div className="flex gap-1">
                <div className="bg-muted h-6 w-6 animate-pulse rounded" />
                <div className="bg-muted h-6 w-6 animate-pulse rounded" />
                <div className="bg-muted h-6 w-12 animate-pulse rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
