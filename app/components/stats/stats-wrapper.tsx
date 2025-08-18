'use client';

import { useFadeIn } from '@/app/hooks/use-fade-in';
import { ReactNode } from 'react';

interface StatsWrapperProps {
  children: ReactNode;
  delay?: number;
}

export function StatsWrapper({ children, delay = 0 }: StatsWrapperProps) {
  const { ref, className } = useFadeIn({ delay, enabled: true });
  
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}