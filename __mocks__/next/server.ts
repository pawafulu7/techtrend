/**
 * Next.js server モジュールのモック
 * NextRequestとNextResponseを適切にモック
 */

// NextRequestクラスのモック
export class NextRequest {
  public url: string;
  public method: string;
  public headers: Headers;
  public body: any;
  public nextUrl: URL;
  private _cookies: Map<string, { name: string; value: string }> = new Map();

  constructor(url: string | URL, init?: RequestInit) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers);
    this.body = init?.body;

    // nextUrl プロパティを初期化（CodexMCP推奨）
    this.nextUrl = new URL(this.url);
  }

  // cookies.get() メソッドを追加
  get cookies() {
    const self = this;
    return {
      get(name: string) {
        return self._cookies.get(name);
      },
      getAll() {
        return Array.from(self._cookies.values());
      },
      set(name: string, value: string) {
        self._cookies.set(name, { name, value });
      },
      delete(name: string) {
        self._cookies.delete(name);
      },
      has(name: string) {
        return self._cookies.has(name);
      }
    };
  }

  set cookies(value: any) {
    // setter は必要ないが、getter との互換性のために定義
  }
  
  async json() {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body);
    }
    return this.body;
  }
  
  async text() {
    if (typeof this.body === 'string') {
      return this.body;
    }
    return JSON.stringify(this.body);
  }
}

// NextResponseクラスのモック
export class NextResponse extends Response {
  static json(data: any, init?: ResponseInit) {
    const body = JSON.stringify(data);
    const response = new NextResponse(body, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      }
    });
    return response;
  }
  
  static redirect(url: string | URL, init?: number | ResponseInit) {
    const status = typeof init === 'number'
      ? init
      : init?.status ?? 307;
    const initObj = typeof init === 'object' ? init : {};
    const headers = new Headers(initObj.headers);
    headers.set('Location', typeof url === 'string' ? url : url.toString());
    return new NextResponse(null, { ...initObj, status, headers });
  }
  
  static rewrite(url: string | URL) {
    return new NextResponse(null, {
      headers: {
        'x-middleware-rewrite': typeof url === 'string' ? url : url.toString()
      }
    });
  }
  
  static next(init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set('x-middleware-next', '1');
    return new NextResponse(null, { ...init, headers });
  }
}

// Headersクラスが存在しない場合のポリフィル
if (typeof Headers === 'undefined') {
  (global as any).Headers = class Headers {
    private headers: Map<string, string>;
    
    constructor(init?: HeadersInit) {
      this.headers = new Map();
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => {
            this.headers.set(key.toLowerCase(), value);
          });
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => {
            this.headers.set(key.toLowerCase(), value);
          });
        } else if (typeof init === 'object') {
          Object.entries(init).forEach(([key, value]) => {
            this.headers.set(key.toLowerCase(), String(value));
          });
        }
      }
    }
    
    get(name: string) {
      const value = this.headers.get(name.toLowerCase());
      return value === undefined ? null : value;
    }
    
    set(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
    }
    
    has(name: string) {
      return this.headers.has(name.toLowerCase());
    }
    
    delete(name: string) {
      this.headers.delete(name.toLowerCase());
    }
    
    forEach(callback: (value: string, key: string) => void) {
      this.headers.forEach(callback);
    }
    
    entries() {
      return this.headers.entries();
    }
    
    keys() {
      return this.headers.keys();
    }
    
    values() {
      return this.headers.values();
    }
  };
}

export default {
  NextRequest,
  NextResponse
};