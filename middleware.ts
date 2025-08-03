import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter, searchRateLimiter, aiRateLimiter } from '@/lib/rate-limiter';

export async function middleware(request: NextRequest) {
  // Only apply rate limiting to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Track request start time for performance measurement
  const startTime = Date.now();
  
  // Skip rate limiting if Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('Rate limiting is disabled: Upstash Redis environment variables not configured');
    return NextResponse.next();
  }

  try {
    // Get client identifier (IP address or anonymous)
    const ip = request.ip ?? 'anonymous';
    
    // Determine which rate limiter to use based on the path
    let limiter = rateLimiter;
    if (request.nextUrl.pathname.includes('/api/articles/search') || 
        request.nextUrl.pathname.includes('/api/search')) {
      limiter = searchRateLimiter;
    } else if (request.nextUrl.pathname.includes('/api/ai')) {
      limiter = aiRateLimiter;
    }

    // Check rate limit
    const { success, limit, reset, remaining } = await limiter.limit(ip);
    
    // If rate limit exceeded, return 429 response
    if (!success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'Please try again later'
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': Math.max(0, Math.ceil((reset - Date.now()) / 1000)).toString(),
          },
        }
      );
    }

    // Add rate limit headers to successful responses
    const response = NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      },
    });
    
    // Add performance tracking header
    response.headers.set('X-Response-Time-Start', startTime.toString());
    
    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(reset).toISOString());
    
    return response;
  } catch (error) {
    // If rate limiting fails, log the error but don't block the request
    console.error('Rate limiting error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};