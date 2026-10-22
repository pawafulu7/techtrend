// 統合テスト用のセットアップ
require('./jest.polyfills');

// 環境変数設定
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// 結合テストはテスト用の DB にデータを作って消すので、接続先は DATABASE_URL だけから取り、テスト用の DB でなければ止める。
// 既定値は置かない（docker-compose.test.yml と test:integration:docker が渡す。next/jest は .env.test.local・.env.test・.env も読む）。
// テストファイルより先に読まれるので、ファイルの中で DATABASE_URL から作る接続（@/lib/prisma を含む）はすべてここで確かめられる
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for integration tests');
}
if (new URL(process.env.DATABASE_URL).pathname !== '/techtrend_test') {
  throw new Error('Integration tests must run against techtrend_test');
}

// タイムアウト延長（統合テストは時間がかかるため）
jest.setTimeout(30000);
