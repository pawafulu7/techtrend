'use client';

import { useEffect } from 'react';

export function NoTransitions() {
  useEffect(() => {
    const removeTransitions = () => {
      document.documentElement.classList.remove('no-transitions');
    };

    // Use requestIdleCallback for better timing
    if ('requestIdleCallback' in window) {
      const handle = (window as unknown as {requestIdleCallback: (callback: () => void, options?: {timeout: number}) => number}).requestIdleCallback(removeTransitions, { timeout: 300 });
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as unknown as {cancelIdleCallback: (handle: number) => void}).cancelIdleCallback(handle);
        }
      };
    } else {
      // Fallback: Wait for fonts and images to load
      Promise.all([
        // Wait for document fonts to be ready
        document.fonts ? document.fonts.ready : Promise.resolve(),
        // Wait for document to be fully loaded
        new Promise(resolve => {
          if (document.readyState === 'complete') {
            resolve(true);
          } else {
            window.addEventListener('load', () => resolve(true), { once: true });
          }
        })
      ]).then(() => {
        // Small additional delay to ensure everything is painted
        setTimeout(removeTransitions, 50);
      });
    }
  }, []);

  return null;
}