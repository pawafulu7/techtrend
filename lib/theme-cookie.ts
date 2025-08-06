import { NextRequest, NextResponse } from 'next/server';

export const THEME_COOKIE_NAME = 'theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type Theme = 'light' | 'dark' | 'system';

/**
 * Get theme from cookie
 */
export function getThemeFromCookie(request: NextRequest): Theme {
  const theme = request.cookies.get(THEME_COOKIE_NAME)?.value as Theme;
  return theme || 'system';
}

/**
 * Set theme cookie in response
 */
export function setThemeCookie(response: NextResponse, theme: Theme): void {
  response.cookies.set({
    name: THEME_COOKIE_NAME,
    value: theme,
    maxAge: THEME_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Get the actual theme based on system preference
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Parse theme from cookie value with validation
 */
export function parseThemeFromCookie(cookieValue: string | undefined): Theme {
  if (cookieValue === 'light' || cookieValue === 'dark' || cookieValue === 'system') {
    return cookieValue;
  }
  return 'system';
}