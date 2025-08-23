import { NextRequest, NextResponse } from 'next/server';
import { setViewModeCookie, parseViewModeFromCookie } from '@/lib/view-mode-cookie';

export async function POST(request: NextRequest) {
  try {
    const { mode } = await request.json();
    const validMode = parseViewModeFromCookie(mode);
    
    const response = NextResponse.json({ success: true, mode: validMode });
    setViewModeCookie(response, validMode);
    
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}