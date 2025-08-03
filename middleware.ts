import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // レートリミットを削除し、単純にリクエストを通す
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};