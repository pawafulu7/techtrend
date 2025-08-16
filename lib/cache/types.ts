export interface CacheOptions {
  ttl?: number; // seconds
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
}

export interface CacheKeyOptions {
  prefix?: string;
  params?: Record<string, unknown>;
}