'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar, Clock, Tag, Sparkles } from 'lucide-react';

export function ArticleSkeleton() {
  // リアルなタイトルパターン
  const titlePatterns = [
    { line1: 'w-full', line2: 'w-4/5' },
    { line1: 'w-5/6', line2: 'w-full' },
    { line1: 'w-full', line2: 'w-3/4' },
    { line1: 'w-4/5', line2: 'w-5/6' },
    { line1: 'w-full', line2: 'w-2/3' },
    { line1: 'w-3/4', line2: 'w-full' },
  ];

  // リアルなタグパターン
  const tagPatterns = [
    ['w-16', 'w-20', 'w-14'],
    ['w-24', 'w-16', 'w-18'],
    ['w-14', 'w-28', 'w-16'],
    ['w-20', 'w-16', 'w-20'],
    ['w-18', 'w-24', 'w-14'],
    ['w-16', 'w-20', 'w-22'],
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
      {[...Array(6)].map((_, i) => (
        <Card 
          key={i} 
          className="relative overflow-hidden"
          style={{
            boxShadow: '0 2px 8px rgba(100, 100, 200, 0.15)',
            background: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid rgba(200, 200, 255, 0.2)',
            animationDelay: `${i * 100}ms`
          }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
          
          <CardHeader className="pb-1 px-3 sm:px-4">
            {/* New Badge skeleton */}
            <div className="flex items-center gap-1 mb-2">
              <Sparkles className="h-3 w-3 text-yellow-500/30 animate-pulse" />
              <div className="h-5 bg-gradient-to-r from-yellow-200 to-yellow-300 dark:from-yellow-700 dark:to-yellow-600 rounded w-16 animate-pulse" />
            </div>
            
            {/* Title skeleton */}
            <div className="space-y-2">
              <div className={`h-5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded animate-pulse ${titlePatterns[i % 6]?.line1 || 'w-full'}`} />
              <div className={`h-5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded animate-pulse ${titlePatterns[i % 6]?.line2 || 'w-4/5'}`} />
            </div>
            
            {/* Meta info skeleton */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground/30" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground/30" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="py-2 px-3 sm:px-4 space-y-3">
            {/* Summary skeleton */}
            <div className="relative pl-3">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full opacity-50 animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-250 dark:from-gray-700 dark:to-gray-650 rounded animate-pulse" />
                <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-250 dark:from-gray-700 dark:to-gray-650 rounded animate-pulse" />
                <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-250 dark:from-gray-700 dark:to-gray-650 rounded w-5/6 animate-pulse" />
              </div>
            </div>
            
            {/* Tags skeleton */}
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-muted-foreground/30" />
              {(tagPatterns[i % 6] || ['w-16', 'w-20', 'w-14']).map((width, idx) => (
                <div key={idx} className={`h-5 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-full ${width} animate-pulse`} />
              ))}
            </div>
            
            {/* Action buttons skeleton */}
            <div className="flex items-center justify-between pt-1">
              <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-20 animate-pulse" />
              <div className="flex gap-1">
                <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}