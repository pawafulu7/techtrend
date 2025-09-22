// 統合テスト用のセットアップ
require('./jest.polyfills');

// 環境変数設定
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test';
process.env.LOG_LEVEL = 'error';

// タイムアウト延長（統合テストは時間がかかるため）
jest.setTimeout(30000);