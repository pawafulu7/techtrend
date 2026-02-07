'use client';

import Link from 'next/link';
import { Calendar, GitCompare, ArrowRight } from 'lucide-react';

const navigationItems = [
  {
    href: '/trends/daily',
    icon: Calendar,
    title: 'デイリーレポート',
    description: 'AI要約付きの日次トレンド分析',
  },
  {
    href: '/trends/diff',
    icon: GitCompare,
    title: '週間変化',
    description: 'トピックの新規・急上昇・下火を追跡',
  },
] as const;

export function TrendNavigationCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group block focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none"
          >
            <div className="bg-background flex items-center gap-4 rounded-lg border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--tt-color-primary)/10">
                <Icon className="h-5 w-5 text-(--tt-color-primary)" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="text-muted-foreground truncate text-xs">
                  {item.description}
                </p>
              </div>
              <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
