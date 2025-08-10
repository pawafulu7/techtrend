// 統合テスト用のセットアップ
import '@testing-library/jest-dom';

// テスト用環境変数の設定
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';

// グローバルタイムアウトの設定
jest.setTimeout(10000);

// エラーログの抑制
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning:')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});