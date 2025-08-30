import { NextRequest, NextResponse } from 'next/server';
import { setSourceFilterCookie, parseSourceFilterFromCookie } from '@/lib/source-filter-cookie';

export async function POST(request: NextRequest) {
  try {
    const { sourceIds } = await request.json();
    
    // Validate input
    if (!Array.isArray(sourceIds)) {
      return NextResponse.json(
        { success: false, error: 'sourceIds must be an array' },
        { status: 400 }
      );
    }
    
    // Validate each source ID is a string
    const validSourceIds = sourceIds.filter(id => typeof id === 'string' && id.trim().length > 0);
    
    // Create response
    const response = NextResponse.json({ 
      success: true, 
      sourceIds: validSourceIds 
    });
    
    // Set cookie
    setSourceFilterCookie(response, validSourceIds);
    
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current cookie value
    const cookieValue = request.cookies.get('source-filter')?.value;
    const sourceIds = parseSourceFilterFromCookie(cookieValue);
    
    return NextResponse.json({ 
      success: true, 
      sourceIds 
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to read cookie' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const response = NextResponse.json({ 
      success: true, 
      message: 'Source filter cookie deleted' 
    });
    
    // Delete the cookie
    response.cookies.delete('source-filter');
    
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to delete cookie' },
      { status: 500 }
    );
  }
}