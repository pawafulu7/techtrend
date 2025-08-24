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
    document.cookie = '';
    
    // Reset document classes
    document.documentElement.classList.remove('light', 'dark');
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
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Force an error by making localStorage throw
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('localStorage not available');
      },
      configurable: true,
    });
    
    render(<ThemeInitializer />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Theme initialization error:',
        expect.any(Error)
      );
    });
    
    // Restore localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
    
    consoleSpy.mockRestore();
  });
});

describe('NoScriptStyles', () => {
  it('renders noscript styles', () => {
    const { container } = render(<NoScriptStyles />);
    const noscript = container.querySelector('noscript');
    
    expect(noscript).toBeInTheDocument();
    expect(noscript?.textContent).toContain('.js-only');
    expect(noscript?.textContent).toContain('.no-js-message');
  });

  it('includes display rules for JS-disabled users', () => {
    const { container } = render(<NoScriptStyles />);
    const noscript = container.querySelector('noscript');
    const styleContent = noscript?.textContent || '';
    
    expect(styleContent).toContain('display: none !important');
    expect(styleContent).toContain('display: block');
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