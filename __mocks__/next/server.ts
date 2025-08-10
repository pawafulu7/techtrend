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
  
  constructor(url: string | URL, init?: RequestInit) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers);
    this.body = init?.body;
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
  
  static redirect(url: string | URL, status?: number) {
    return new NextResponse(null, {
      status: status || 302,
      headers: {
        Location: typeof url === 'string' ? url : url.toString()
      }
    });
  }
  
  static rewrite(url: string | URL) {
    return new NextResponse(null, {
      headers: {
        'x-middleware-rewrite': typeof url === 'string' ? url : url.toString()
      }
    });
  }
  
  static next() {
    return new NextResponse(null, {
      headers: {
        'x-middleware-next': '1'
      }
    });
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
      return this.headers.get(name.toLowerCase()) || null;
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