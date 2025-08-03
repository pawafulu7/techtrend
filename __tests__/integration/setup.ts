// 統合テスト用のセットアップ
// 実際のRedis接続を使用するため、モックを無効化

// ioredisのモックを解除
jest.unmock('ioredis');

// 環境変数の設定
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

export {};