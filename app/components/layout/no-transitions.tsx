'use client';

import { useEffect } from 'react';

export function NoTransitions() {
  useEffect(() => {
    // Remove no-transitions class after a short delay to enable transitions
    const timeout = setTimeout(() => {
      document.documentElement.classList.remove('no-transitions');
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

  return null;
}