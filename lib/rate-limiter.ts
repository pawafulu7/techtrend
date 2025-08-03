import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Create a Redis instance using environment variables
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Create a rate limiter instance
export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
  prefix: '@techtrend/api',
});

// Alternative rate limiters for different endpoints
export const searchRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'), // 30 searches per minute
  analytics: true,
  prefix: '@techtrend/search',
});

export const aiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 h'), // 10 AI requests per hour
  analytics: true,
  prefix: '@techtrend/ai',
});