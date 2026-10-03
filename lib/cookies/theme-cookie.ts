import { NextRequest, NextResponse } from 'next/server';

export const THEME_COOKIE_NAME = 'theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type Theme = 'light' | 'dark' | 'system';

/**
 * Get theme from cookie
 *
 * 値は検証してから返す。proxy はこの値を x-theme ヘッダに入れるので、Cookie に %00 や %0A
 * （Next の Cookie パーサが NUL・改行に戻す）があるとヘッダの値として不正になり、
 * 全リクエストが 500 になっていた（issue #687 のレビューで発見）
 */
export function getThemeFromCookie(request: NextRequest): Theme {
  return parseThemeFromCookie(request.cookies.get(THEME_COOKIE_NAME)?.value);
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
export function resolveTheme(
  theme: Theme,
  prefersDark: boolean
): 'light' | 'dark' {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Parse theme from cookie value with validation
 */
export function parseThemeFromCookie(cookieValue: string | undefined): Theme {
  if (
    cookieValue === 'light' ||
    cookieValue === 'dark' ||
    cookieValue === 'system'
  ) {
    return cookieValue;
  }
  return 'system';
}
