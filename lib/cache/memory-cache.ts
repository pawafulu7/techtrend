/**
 * L1 Memory Cache Implementation
 * プロセス内メモリキャッシュ（高速アクセス用）
 * DataLoader統合のための第1層キャッシュ
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface MemoryCacheOptions {
  maxSize?: number;        // 最大エントリ数
  defaultTTL?: number;     // デフォルトTTL（秒）
  cleanupInterval?: number; // クリーンアップ間隔（秒）
}

export class MemoryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  // メトリクス
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
    deletes: 0,
  };

  constructor(options: MemoryCacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 60; // 60秒

    // クリーンアップタイマー設定
    if (options.cleanupInterval !== 0) {
      const interval = (options.cleanupInterval || 60) * 1000;
      this.cleanupTimer = setInterval(() => this.cleanup(), interval);
    }
  }

  /**
   * キャッシュから値を取得
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // TTL確認
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // アクセス情報更新
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    return entry.data;
  }

  /**
   * キャッシュに値を設定
   */
  set(key: string, value: T, ttl?: number): void {
    const ttlSeconds = ttl || this.defaultTTL;
    const expiresAt = Date.now() + (ttlSeconds * 1000);

    // サイズ制限チェック
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data: value,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
    });

    this.stats.sets++;
  }

  /**
   * 複数のキーを一度に取得（バッチ取得）
   */
  mget(keys: string[]): Map<string, T | null> {
    const results = new Map<string, T | null>();

    for (const key of keys) {
      results.set(key, this.get(key));
    }

    return results;
  }

  /**
   * 複数のキーを一度に設定（バッチ設定）
   */
  mset(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const { key, value, ttl } of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * キャッシュから削除
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    if (result) {
      this.stats.deletes++;
    }
    return result;
  }

  /**
   * パターンマッチングで削除
   */
  deletePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.deletes += count;
    return count;
  }

  /**
   * キャッシュクリア
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  /**
   * LRU（Least Recently Used）エビクション
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 期限切れエントリのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
    }
  }

  /**
   * キャッシュ統計情報取得
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;

    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + '%',
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * クリーンアップタイマー停止
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// DataLoader用の特化型メモリキャッシュ
export class DataLoaderMemoryCache extends MemoryCache<any> {
  constructor() {
    super({
      maxSize: 500,      // DataLoaderは少なめのエントリ数
      defaultTTL: 30,    // 30秒（短めのTTL）
      cleanupInterval: 60, // 1分ごとにクリーンアップ
    });
  }

  /**
   * ユーザー別キャッシュキー生成
   */
  getUserKey(userId: string, prefix: string): string {
    return `${prefix}:user:${userId}`;
  }

  /**
   * 記事別キャッシュキー生成
   */
  getArticleKey(articleId: string, prefix: string): string {
    return `${prefix}:article:${articleId}`;
  }

  /**
   * ユーザーと記事の複合キー生成
   */
  getUserArticleKey(userId: string, articleId: string, prefix: string): string {
    return `${prefix}:user:${userId}:article:${articleId}`;
  }

  /**
   * ユーザー関連キャッシュの無効化
   */
  invalidateUser(userId: string): void {
    const pattern = `:user:${userId}`;
    this.deletePattern(pattern);
  }

  /**
   * 記事関連キャッシュの無効化
   */
  invalidateArticle(articleId: string): void {
    const pattern = `:article:${articleId}`;
    this.deletePattern(pattern);
  }
}