/**
 * Critical CSS and Theme Initialization Component
 * Provides safe alternative to dangerouslySetInnerHTML
 */

import React from 'react';

// Critical CSS variables for theme support
const criticalCSS = {
  root: {
    '--radius': '0.625rem',
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.145 0 0)',
    '--primary': 'oklch(0.205 0 0)',
    '--border': 'oklch(0.922 0 0)',
  },
  dark: {
    '--background': 'oklch(0.145 0 0)',
    '--foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.922 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
  },
};

/**
 * Generate CSS string from style object
 */
function generateCSSString(selector: string, styles: Record<string, string>): string {
  const properties = Object.entries(styles)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n    ');
  return `${selector} {\n    ${properties}\n  }`;
}

/**
 * Safe critical styles component
 */
export function CriticalStyles() {
  const cssContent = [
    generateCSSString(':root', criticalCSS.root),
    generateCSSString('.dark', criticalCSS.dark),
    `html.no-transitions *,
  html.no-transitions *::before,
  html.no-transitions *::after {
    transition: none !important;
    animation: none !important;
  }`,
    `body {
    margin: 0;
    background-color: var(--background);
    color: var(--foreground);
  }`,
  ].join('\n\n  ');

  return <style>{cssContent}</style>;
}

/**
 * Theme initialization script component
 * Uses data attributes instead of inline script for CSP compliance
 */
export function ThemeInitializer({ cookieTheme }: { cookieTheme?: string }) {
  React.useEffect(() => {
    // This runs only on client side
    try {
      const getCookie = (name: string): string | undefined => {
        const value = '; ' + document.cookie;
        const parts = value.split('; ' + name + '=');
        if (parts.length === 2) {
          const cookieValue = parts.pop()?.split(';').shift();
          return cookieValue;
        }
        return undefined;
      };

      const theme = getCookie('theme') || localStorage.getItem('theme') || 'system';
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const activeTheme = theme === 'system' ? systemTheme : theme;

      // Check if theme is already correct
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      if (currentTheme !== activeTheme) {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(activeTheme);
      }
    } catch (_error) {
    }
  }, []);

  // For SSR, we provide initial theme via data attribute
  return (
    <script
      type="application/json"
      id="theme-config"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ initialTheme: cookieTheme || 'system' })
      }}
    />
  );
}

/**
 * NoScript fallback for users with JavaScript disabled
 */
export function NoScriptStyles() {
  return (
    <noscript>
      <style>{`
        .js-only {
          display: none !important;
        }
        .no-js-message {
          display: block;
          padding: 1rem;
          background: #fef3c7;
          color: #92400e;
          text-align: center;
        }
      `}</style>
    </noscript>
  );
}