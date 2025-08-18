'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ChartSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] bg-gray-100 dark:bg-gray-800 rounded-lg relative overflow-hidden">
          {/* チャート軸線 */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200 dark:bg-gray-700" />
          <div className="absolute top-0 bottom-0 left-12 w-px bg-gray-200 dark:bg-gray-700" />
          
          {/* バーチャート風の要素 */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around px-16 pb-4">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="w-8 bg-gray-200 dark:bg-gray-700 rounded-t"
                style={{
                  height: `${Math.random() * 60 + 20}%`,
                  animationDelay: `${i * 100}ms`
                }}
              />
            ))}
          </div>
          
          {/* ローディングインジケーター */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-gray-400 dark:text-gray-600">
              <svg
                className="animate-spin h-8 w-8"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}