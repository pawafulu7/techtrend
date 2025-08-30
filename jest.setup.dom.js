// DOM/React環境用のセットアップ
import '@testing-library/jest-dom';

// Next.jsのuseRouterモック
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    query: {},
    pathname: '/',
    route: '/',
    asPath: '/',
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
  }),
}));

// window.openのモック
global.open = jest.fn();

// window.location は jsdom で再定義・spy が失敗する環境があるため特別なモックは行わない
// 参照: https://github.com/jsdom/jsdom/issues/2304

// jsdom が出す既知のノイズエラーログを抑制（テスト失敗には影響しない）
const originalConsoleError = console.error;
const IGNORED_ERROR_PATTERNS = [
  'Not implemented: navigation (except hash changes)',
  'not wrapped in act(...)',
];
jest.spyOn(console, 'error').mockImplementation((...args) => {
  const first = args[0];
  const toMessage = (val) => {
    if (typeof val === 'string') return val;
    if (val && typeof val.message === 'string') return val.message;
    try { return String(val); } catch { return ''; }
  };
  const msg = toMessage(first);
  if (IGNORED_ERROR_PATTERNS.some(p => msg.includes(p))) return;
  originalConsoleError(...args);
});

// fetchのモック
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK',
  })
);

// IntersectionObserverのモック
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

// ResizeObserverのモック
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// matchMediaのモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// scrollToのモック
window.scrollTo = jest.fn();

// indexedDBのモック
global.indexedDB = {
  open: jest.fn(() => ({
    result: {
      createObjectStore: jest.fn(),
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          get: jest.fn(() => ({
            onsuccess: jest.fn(),
            onerror: jest.fn(),
          })),
          put: jest.fn(() => ({
            onsuccess: jest.fn(),
            onerror: jest.fn(),
          })),
          delete: jest.fn(() => ({
            onsuccess: jest.fn(),
            onerror: jest.fn(),
          })),
          getAll: jest.fn(() => ({
            onsuccess: jest.fn(),
            onerror: jest.fn(),
          })),
        })),
      })),
    },
    onsuccess: jest.fn(),
    onerror: jest.fn(),
    onupgradeneeded: jest.fn(),
  })),
  deleteDatabase: jest.fn(),
};

// モックのクリーンアップ
afterEach(() => {
  jest.clearAllMocks();
});
