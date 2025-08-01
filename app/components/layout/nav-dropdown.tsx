'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface NavDropdownProps {
  items: NavItem[];
  label?: string;
  variant?: 'desktop' | 'mobile';
  className?: string;
}

export function NavDropdown({ 
  items, 
  label = 'その他', 
  variant = 'desktop',
  className = '' 
}: NavDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${className} ${
            variant === 'mobile' ? 'w-full justify-start' : ''
          }`}
        >
          {variant === 'desktop' ? (
            <>
              <span className="mr-1">{label}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </>
          ) : (
            <>
              <MoreVertical className="h-5 w-5 mr-2" />
              <span>{label}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-56" 
        align={variant === 'mobile' ? 'start' : 'end'}
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.href}>
              {index > 0 && index % 3 === 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <Link
                  href={item.href}
                  className="flex items-center w-full cursor-pointer"
                  onClick={() => setOpen(false)}
                >
                  {Icon && <Icon className="h-4 w-4 mr-2" />}
                  <span>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}