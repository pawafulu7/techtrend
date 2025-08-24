import { NextRequest, NextResponse } from 'next/server';
import { getThemeFromCookie } from '@/lib/theme-cookie';

// 認証が必要なパスのリスト
const protectedPaths = [
  '/profile',
  '/favorites',
  '/history',
];

// 認証が必要なAPIパス
const protectedApiPaths = [
  '/api/favorites',
  // '/api/article-views', // 未認証ユーザーも記録できるようにするため除外
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // 保護されたパスかチェック
  const isProtectedPath = protectedPaths.some(path => 
    pathname.startsWith(path)
  );
  
  const isProtectedApiPath = protectedApiPaths.some(path => 
    pathname.startsWith(path)
  );

  if (isProtectedPath || isProtectedApiPath) {
    // セッションチェック（cookieベース）
    const sessionCookie = request.cookies.get('authjs.session-token') || 
                         request.cookies.get('__Secure-authjs.session-token');

    if (!sessionCookie) {
      // APIルートの場合は401を返す
      if (isProtectedApiPath) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // ページの場合はログインページにリダイレクト
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();
  
  // テーマCookieの処理
  const theme = getThemeFromCookie(request);
  
  // レスポンスヘッダーにテーマ情報を追加（デバッグ用）
  response.headers.set('x-theme', theme);
  
  return response;
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};