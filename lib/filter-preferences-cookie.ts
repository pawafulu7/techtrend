import { NextRequest, NextResponse } from 'next/server';

export interface FilterPreferences {
  sources?: string[];
  search?: string;
  tags?: string[];
  tagMode?: 'AND' | 'OR';
  dateRange?: string;
  sortBy?: string;
  viewMode?: 'grid' | 'list';
  updatedAt?: string;
}

export const FILTER_PREFERENCES_COOKIE_NAME = 'filter-preferences';
export const FILTER_PREFERENCES_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Get filter preferences from cookie (server-side)
 */
export function getFilterPreferences(request: NextRequest): FilterPreferences {
  const cookie = request.cookies.get(FILTER_PREFERENCES_COOKIE_NAME);
  if (!cookie) return {};
  
  try {
    return JSON.parse(cookie.value);
  } catch {
    return {};
  }
}

/**
 * Get filter preferences from cookies (for server components)
 */
export function getFilterPreferencesFromCookies(cookieStore: any): FilterPreferences {
  const cookie = cookieStore.get(FILTER_PREFERENCES_COOKIE_NAME);
  if (!cookie) return {};
  
  try {
    return JSON.parse(cookie.value);
  } catch {
    return {};
  }
}

/**
 * Set filter preferences in response cookie
 */
export function setFilterPreferences(
  response: NextResponse, 
  preferences: FilterPreferences
): void {
  // Add timestamp
  const prefsWithTimestamp = {
    ...preferences,
    updatedAt: new Date().toISOString()
  };

  response.cookies.set({
    name: FILTER_PREFERENCES_COOKIE_NAME,
    value: JSON.stringify(prefsWithTimestamp),
    maxAge: FILTER_PREFERENCES_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Parse filter preferences from cookie value (client-side)
 */
export function parseFilterPreferencesFromCookie(cookieValue: string | undefined): FilterPreferences {
  if (!cookieValue) return {};
  
  try {
    return JSON.parse(cookieValue);
  } catch {
    return {};
  }
}

/**
 * Get filter preferences from document.cookie (client-side)
 */
export function getFilterPreferencesClient(): FilterPreferences {
  if (typeof document === 'undefined') return {};
  
  const cookies = document.cookie.split(';');
  const prefsCookie = cookies.find(cookie => 
    cookie.trim().startsWith(`${FILTER_PREFERENCES_COOKIE_NAME}=`)
  );
  
  if (!prefsCookie) return {};
  
  const value = prefsCookie.split('=')[1];
  return parseFilterPreferencesFromCookie(decodeURIComponent(value));
}

/**
 * Delete filter preferences cookie in response
 */
export function deleteFilterPreferences(response: NextResponse): void {
  response.cookies.delete(FILTER_PREFERENCES_COOKIE_NAME);
}