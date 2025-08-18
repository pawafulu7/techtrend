'use client';

import { useFadeIn } from '@/app/hooks/use-fade-in';
import { ReactNode } from 'react';

interface HomeContentWrapperProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function HomeContentWrapper({ 
  children, 
  delay = 0,
  className = ''
}: HomeContentWrapperProps) {
  const { ref, className: fadeInClass } = useFadeIn({ delay, enabled: true });
  
  return (
    <div ref={ref} className={`${fadeInClass} ${className}`}>
      {children}
    </div>
  );
}

export function ToolbarWrapper({ children }: { children: ReactNode }) {
  const { ref, className } = useFadeIn({ delay: 0, enabled: true });
  
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function SidebarWrapper({ children }: { children: ReactNode }) {
  const { ref, className } = useFadeIn({ delay: 50, enabled: true });
  
  return (
    <aside ref={ref} className={`${className} hidden lg:block lg:w-64 lg:flex-shrink-0 lg:bg-gray-50 dark:lg:bg-gray-900/50 lg:border-r lg:border-gray-200 dark:lg:border-gray-700 lg:overflow-y-auto`}>
      {children}
    </aside>
  );
}

export function ArticleListWrapper({ children }: { children: ReactNode }) {
  const { ref, className } = useFadeIn({ delay: 100, enabled: true });
  
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}