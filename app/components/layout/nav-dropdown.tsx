'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavDropdownProps {
  items: NavItem[];
}

export function NavDropdown({ items }: NavDropdownProps) {
  const pathname = usePathname();
  const hasActiveItem = items.some((item) => pathname === item.href);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
          hasActiveItem
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-secondary/30 hover:bg-secondary/60 hover:scale-105'
        )}
        data-testid="nav-dropdown-trigger"
      >
        <span>その他</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`nav-dropdown-item-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2',
                  isActive && 'bg-primary/10 font-semibold'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
