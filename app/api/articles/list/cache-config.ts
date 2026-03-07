import { RedisCache } from '@/lib/cache';

// Initialize Redis cache with 30 minutes TTL for lightweight articles
export const cache = new RedisCache({
  ttl: 1800, // 30 minutes (increased from 5 minutes)
  namespace: '@techtrend/cache:api:lightweight',
});

// Total count cache (5 min TTL)
export const countCache = new RedisCache({
  ttl: 300, // 5 min
  namespace: '@techtrend/cache:api:count',
});
