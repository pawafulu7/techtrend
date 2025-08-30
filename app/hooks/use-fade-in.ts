'use client';

import { useEffect, useRef, useState } from 'react';

interface UseFadeInOptions {
  delay?: number;
  duration?: number;
  enabled?: boolean;
}

export function useFadeIn(options: UseFadeInOptions = {}) {
  const { delay = 0, duration: _duration = 300, enabled = true } = options;
  const [isVisible, setIsVisible] = useState(!enabled);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
      
      // アニメーション完了を検知
      if (elementRef.current) {
        const handleAnimationEnd = () => {
          elementRef.current?.classList.add('fade-in-complete');
        };
        
        elementRef.current.addEventListener('animationend', handleAnimationEnd);
        
        return () => {
          elementRef.current?.removeEventListener('animationend', handleAnimationEnd);
        };
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, enabled]);

  const className = enabled && isVisible ? 'fade-in-content' : enabled ? 'opacity-0' : '';
  
  return {
    ref: elementRef,
    className,
    isVisible,
  };
}