/**
 * ioredis のモック
 * Redis クライアントの動作をシミュレート
 */

class RedisMock {
  private store: Map<string, { value: string; ttl?: number; expireAt?: number }> = new Map();
  private listeners: Map<string, Function[]> = new Map();

  constructor(options?: any) {
    // 初期化時にreadyイベントを発火
    setTimeout(() => {
      this.emit('ready');
      this.emit('connect');
    }, 0);
  }

  async connect() {
    return this;
  }

  async ping() {
    return 'PONG';
  }

  async set(key: string, value: string, ...args: any[]) {
    const item: any = { value };
    
    // TTL設定の処理
    if (args[0] === 'EX' && args[1]) {
      item.ttl = args[1];
      item.expireAt = Date.now() + args[1] * 1000;
    }
    
    this.store.set(key, item);
    return 'OK';
  }

  async get(key: string) {
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }
    
    // TTLチェック
    if (item.expireAt && item.expireAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async del(key: string) {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string) {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number) {
    const item = this.store.get(key);
    if (item) {
      item.ttl = seconds;
      item.expireAt = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  }

  async ttl(key: string) {
    const item = this.store.get(key);
    
    if (!item) {
      return -2; // Key does not exist
    }
    
    if (!item.expireAt) {
      return -1; // Key exists but has no TTL
    }
    
    const remainingTtl = Math.floor((item.expireAt - Date.now()) / 1000);
    
    if (remainingTtl <= 0) {
      this.store.delete(key);
      return -2;
    }
    
    return remainingTtl;
  }

  async keys(pattern: string) {
    const allKeys = Array.from(this.store.keys());
    
    if (pattern === '*') {
      return allKeys;
    }
    
    // 簡単なパターンマッチング
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allKeys.filter(key => regex.test(key));
  }

  async flushall() {
    this.store.clear();
    return 'OK';
  }

  async quit() {
    this.store.clear();
    this.listeners.clear();
    return 'OK';
  }

  async disconnect() {
    return this.quit();
  }

  on(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  off(event: string, handler?: Function) {
    if (!handler) {
      this.listeners.delete(event);
    } else {
      const handlers = this.listeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  private emit(event: string, ...args: any[]) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  // Pipelineサポート（簡易版）
  pipeline() {
    const commands: any[] = [];
    const self = this;
    
    return {
      set(key: string, value: string) {
        commands.push(['set', key, value]);
        return this;
      },
      get(key: string) {
        commands.push(['get', key]);
        return this;
      },
      del(key: string) {
        commands.push(['del', key]);
        return this;
      },
      async exec() {
        const results = [];
        for (const [cmd, ...args] of commands) {
          const result = await (self as any)[cmd](...args);
          results.push([null, result]);
        }
        return results;
      }
    };
  }

  // Pub/Subサポート（簡易版）
  subscribe(channel: string) {
    return Promise.resolve(1);
  }

  unsubscribe(channel: string) {
    return Promise.resolve(1);
  }

  publish(channel: string, message: string) {
    return Promise.resolve(0);
  }
}

export default RedisMock;
export const Redis = RedisMock;