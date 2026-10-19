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
import {
  isNavActive,
  navAriaCurrent,
  navTabClass,
} from '@/components/ui-v2/nav-tab';

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
  const hasActiveItem = items.some((item) => isNavActive(pathname, item.href));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={navTabClass(hasActiveItem, 'gap-1')}
        data-testid="nav-dropdown-trigger"
      >
        <span>その他</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(pathname, item.href);

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={navAriaCurrent(pathname, item.href)}
                data-testid={`nav-dropdown-item-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2',
                  isActive &&
                    'bg-(--tt-color-primary-bg) font-semibold text-(--tt-color-primary)'
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
