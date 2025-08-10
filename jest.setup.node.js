// Node.js環境用のセットアップ
import '@testing-library/jest-dom';

// グローバルfetchのモック（Node環境用）
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    headers: new Map(),
  })
);

// Next.jsのレスポンスモック
global.Response = class Response {
  constructor(body, init) {
    this.body = body;
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.headers = new Map(Object.entries(init?.headers || {}));
    this.ok = this.status >= 200 && this.status < 300;
  }
  
  json() {
    if (typeof this.body === 'string') {
      return Promise.resolve(JSON.parse(this.body));
    }
    return Promise.resolve(this.body);
  }
  
  text() {
    if (typeof this.body === 'string') {
      return Promise.resolve(this.body);
    }
    return Promise.resolve(JSON.stringify(this.body));
  }
  
  clone() {
    return new Response(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers)
    });
  }
};

// console.errorを抑制（テスト時のノイズを減らす）
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Not implemented') ||
       args[0].includes('Warning:'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// モックのクリーンアップ
afterEach(() => {
  jest.clearAllMocks();
});