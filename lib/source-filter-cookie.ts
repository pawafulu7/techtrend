import { NextRequest, NextResponse } from 'next/server';

export const SOURCE_FILTER_COOKIE_NAME = 'source-filter';
export const SOURCE_FILTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Get source filter from cookie (server-side)
 */
export function getSourceFilterFromCookie(request: NextRequest): string[] {
  const value = request.cookies.get(SOURCE_FILTER_COOKIE_NAME)?.value;
  return parseSourceFilterFromCookie(value);
}

/**
 * Set source filter cookie in response
 */
export function setSourceFilterCookie(response: NextResponse, sourceIds: string[]): void {
  // If empty array, delete the cookie
  if (sourceIds.length === 0) {
    response.cookies.delete(SOURCE_FILTER_COOKIE_NAME);
    return;
  }

  response.cookies.set({
    name: SOURCE_FILTER_COOKIE_NAME,
    value: sourceIds.join(','),
    maxAge: SOURCE_FILTER_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Parse source filter from cookie value with validation
 */
export function parseSourceFilterFromCookie(cookieValue: string | undefined): string[] {
  if (!cookieValue) return [];
  
  // Split by comma and filter out empty strings
  return cookieValue
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/**
 * Parse source filter from cookie value for client-side usage
 * This version reads directly from document.cookie
 */
export function parseSourceFilterFromCookieClient(): string[] {
  if (typeof document === 'undefined') return [];
  
  const cookies = document.cookie.split(';');
  const sourceFilterCookie = cookies.find(cookie => 
    cookie.trim().startsWith(`${SOURCE_FILTER_COOKIE_NAME}=`)
  );
  
  if (!sourceFilterCookie) return [];
  
  const value = sourceFilterCookie.split('=')[1];
  return parseSourceFilterFromCookie(decodeURIComponent(value));
}