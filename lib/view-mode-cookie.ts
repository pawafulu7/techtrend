import { NextRequest, NextResponse } from 'next/server';

export const VIEW_MODE_COOKIE_NAME = 'article-view-mode';
export const VIEW_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type ViewMode = 'card' | 'list';

export function getViewModeFromCookie(request: NextRequest): ViewMode {
  const mode = request.cookies.get(VIEW_MODE_COOKIE_NAME)?.value as ViewMode;
  return mode || 'card'; // デフォルトはカード形式
}

export function setViewModeCookie(response: NextResponse, mode: ViewMode): void {
  response.cookies.set({
    name: VIEW_MODE_COOKIE_NAME,
    value: mode,
    maxAge: VIEW_MODE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function parseViewModeFromCookie(cookieValue: string | undefined): ViewMode {
  if (cookieValue === 'card' || cookieValue === 'list') {
    return cookieValue;
  }
  return 'card';
}