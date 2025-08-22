/**
 * Redisクライアントのモック
 * RedisMockFactoryを使用した統一されたモック実装
 */

import { RedisMockFactory } from '@/test/factories/redis-mock-factory';

// グローバルなRedisモックインスタンス
const mockClient = RedisMockFactory.createMock('global');

// エクスポート
export const getRedisClient = jest.fn(() => mockClient);
export const closeRedisConnection = jest.fn(() => Promise.resolve());
export const redis = mockClient;
export const redisMock = mockClient; // 後方互換性

// Note: モックのリセットは各テストファイルのbeforeEachで行う

// デフォルトエクスポート
export default mockClient;