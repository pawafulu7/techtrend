// 統合テスト用のセットアップ
import '@testing-library/jest-dom';

// テスト用環境変数の設定
process.env.NODE_ENV = 'test';
// PostgreSQL接続設定（テスト用DB）
process.env.DATABASE_URL_POSTGRESQL = 'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_test';
process.env.DATABASE_URL = process.env.DATABASE_URL_POSTGRESQL;

// Redisの設定
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

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