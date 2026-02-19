'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Network, Building2, HeartPulse, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';

const techMapNavItems = [
  { href: '/tech-map', label: 'Overview', icon: Network, exact: true },
  {
    href: '/tech-map/companies',
    label: 'Companies',
    icon: Building2,
    exact: false,
  },
  { href: '/tech-map/health', label: 'Health', icon: HeartPulse, exact: false },
  { href: '/tech-map/radar', label: 'Radar', icon: Radar, exact: false },
] as const;

export function TechMapSubNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
      role="tablist"
      aria-label="Tech Map navigation"
    >
      {techMapNavItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href, item.exact);

        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
