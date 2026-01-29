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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: skip animation when disabled
      setIsVisible(true);
      return;
    }

    // Capture ref value to avoid stale ref in cleanup
    const element = elementRef.current;

    // Handler declared at effect level for proper cleanup
    const handleAnimationEnd = () => {
      element?.classList.add('fade-in-complete');
    };

    const timer = setTimeout(() => {
      setIsVisible(true);

      // アニメーション完了を検知
      if (element) {
        element.addEventListener('animationend', handleAnimationEnd);
      }
    }, delay);

    // Cleanup: clear timeout and remove listener
    return () => {
      clearTimeout(timer);
      element?.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [delay, enabled]);

  const className =
    enabled && isVisible ? 'fade-in-content' : enabled ? 'opacity-0' : '';

  return {
    ref: elementRef,
    className,
    isVisible,
  };
}
