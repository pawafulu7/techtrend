/**
 * Tests for CriticalStyles component
 * Ensures safe CSS injection and theme initialization
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  CriticalStyles,
  ThemeInitializer,
  NoScriptStyles,
} from '@/app/components/common/critical-styles';

describe('CriticalStyles', () => {
  it('renders critical CSS without dangerouslySetInnerHTML', () => {
    const { container } = render(<CriticalStyles />);
    const styleElement = container.querySelector('style');
    
    expect(styleElement).toBeInTheDocument();
    expect(styleElement?.textContent).toContain(':root');
    expect(styleElement?.textContent).toContain('.dark');
    expect(styleElement?.textContent).toContain('--background');
    expect(styleElement?.textContent).toContain('--foreground');
  });

  it('includes no-transition styles', () => {
    const { container } = render(<CriticalStyles />);
    const styleElement = container.querySelector('style');
    
    expect(styleElement?.textContent).toContain('html.no-transitions');
    expect(styleElement?.textContent).toContain('transition: none !important');
  });

  it('includes body styles', () => {
    const { container } = render(<CriticalStyles />);
    const styleElement = container.querySelector('style');
    
    expect(styleElement?.textContent).toContain('body {');
    expect(styleElement?.textContent).toContain('margin: 0');
  });
});

describe('ThemeInitializer', () => {
  beforeEach(() => {
    // Clear localStorage and cookies
    localStorage.clear();
    // Properly clear the 'theme' cookie that some tests may set
    document.cookie = 'theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    
    // Reset document classes
    document.documentElement.classList.remove('light', 'dark');

    // Reset matchMedia to default (light) for isolation
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      media: '(prefers-color-scheme: dark)',
      onchange: null,
    }) as unknown as typeof window.matchMedia;
  });

  it('renders theme config script', () => {
    const { container } = render(<ThemeInitializer cookieTheme="dark" />);
    const script = container.querySelector('#theme-config');
    
    expect(script).toBeInTheDocument();
    expect(script?.getAttribute('type')).toBe('application/json');
  });

  it('initializes theme from cookie', async () => {
    document.cookie = 'theme=dark';
    render(<ThemeInitializer />);
    
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('falls back to localStorage when no cookie', async () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeInitializer />);
    
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('uses system theme when no preference', async () => {
    // Mock matchMedia
    const mockMatchMedia = jest.fn().mockReturnValue({
      matches: true, // dark mode
      addListener: jest.fn(),
      removeListener: jest.fn(),
    });
    window.matchMedia = mockMatchMedia;
    
    render(<ThemeInitializer />);
    
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('handles theme initialization errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Force an error by making matchMedia throw
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn(() => {
      throw new Error('matchMedia not available');
    }) as unknown as typeof window.matchMedia;

    render(<ThemeInitializer />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Theme initialization error:',
        expect.any(Error)
      );
    });

    // Restore matchMedia
    window.matchMedia = originalMatchMedia;
    consoleSpy.mockRestore();
  });
});

describe('NoScriptStyles', () => {
  it('renders noscript element', () => {
    const { container } = render(<NoScriptStyles />);
    const noscript = container.querySelector('noscript');
    
    // jsdom はスクリプト有効のため <noscript> 内の内容は空になる
    // ここでは要素の存在のみを検証する
    expect(noscript).toBeInTheDocument();
  });

  it('is present for JS-disabled users (content not parsed in jsdom)', () => {
    const { container } = render(<NoScriptStyles />);
    const noscript = container.querySelector('noscript');
    expect(noscript).toBeInTheDocument();
  });
});

describe('Integration', () => {
  it('all components work together without conflicts', () => {
    const { container } = render(
      <>
        <CriticalStyles />
        <ThemeInitializer cookieTheme="system" />
        <NoScriptStyles />
      </>
    );
    
    expect(container.querySelectorAll('style').length).toBe(1);
    expect(container.querySelectorAll('script').length).toBe(1);
    expect(container.querySelectorAll('noscript').length).toBe(1);
  });
});
