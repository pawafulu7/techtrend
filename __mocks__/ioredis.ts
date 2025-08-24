class RedisMock {
  private store: Map<string, any> = new Map();
  
  constructor(_options?: any) {
    // Constructor accepts options but ignores them for mock
  }
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: any, ..._args: any[]): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  
  async setex(key: string, _seconds: number, value: any): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  
  async del(key: string | string[]): Promise<number> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const k of key) {
        if (this.store.delete(k)) deleted++;
      }
      return deleted;
    }
    return this.store.delete(key) ? 1 : 0;
  }
  
  async flushall(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
  
  async flushdb(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
  
  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }
  
  async expire(key: string, _seconds: number): Promise<number> {
    // Simple implementation - just return 1 if key exists
    return this.store.has(key) ? 1 : 0;
  }
  
  async ttl(key: string): Promise<number> {
    // Simple implementation - return -1 if no expiry, -2 if key doesn't exist
    return this.store.has(key) ? -1 : -2;
  }
  
  async keys(pattern: string): Promise<string[]> {
    if (pattern === '*') {
      return Array.from(this.store.keys());
    }
    // Simple pattern matching for wildcards
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }
  
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map(key => this.store.get(key) || null);
  }
  
  async mset(...args: any[]): Promise<'OK'> {
    for (let i = 0; i < args.length; i += 2) {
      this.store.set(args[i], args[i + 1]);
    }
    return 'OK';
  }
  
  // Clear store between tests
  _reset(): void {
    this.store.clear();
  }
}

// Export as default constructor for compatibility with "new Redis()"
export default RedisMock;
export { RedisMock };