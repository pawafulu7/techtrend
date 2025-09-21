// SourceCacheのモック
export class SourceCache {
  constructor(options?: any) {
    // コンストラクタパラメータは無視
  }

  get = jest.fn().mockResolvedValue(null);
  set = jest.fn().mockResolvedValue(true);
  delete = jest.fn().mockResolvedValue(true);
  exists = jest.fn().mockResolvedValue(false);
  clear = jest.fn().mockResolvedValue(true);
  disconnect = jest.fn().mockResolvedValue(undefined);
}