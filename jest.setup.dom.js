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