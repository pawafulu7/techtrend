import { NextRequest, NextResponse } from 'next/server';
import { getThemeFromCookie } from '@/lib/theme-cookie';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // テーマCookieの処理
  const theme = getThemeFromCookie(request);
  
  // レスポンスヘッダーにテーマ情報を追加（デバッグ用）
  response.headers.set('x-theme', theme);
  
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};