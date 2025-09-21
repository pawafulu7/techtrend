// DataLoaderのモック実装 - バッチング機能を含む
class DataLoaderMock {
  constructor(batchFn, options) {
    this.batchFn = batchFn;
    this.cache = new Map();
    this.useCache = options?.cache !== false;
    this.batch = [];
    this.batchPromises = [];
    this.scheduledBatch = null;
  }

  async load(key) {
    // キャッシュチェック
    if (this.useCache && this.cache.has(key)) {
      return Promise.resolve(this.cache.get(key));
    }

    // バッチに追加
    return new Promise((resolve, reject) => {
      this.batch.push(key);
      this.batchPromises.push({ key, resolve, reject });

      // バッチ実行をスケジュール
      if (!this.scheduledBatch) {
        this.scheduledBatch = Promise.resolve().then(() => this.dispatchBatch());
      }
    });
  }

  async loadMany(keys) {
    return Promise.all(keys.map(key => this.load(key)));
  }

  async dispatchBatch() {
    const batch = [...this.batch];
    const promises = [...this.batchPromises];

    this.batch = [];
    this.batchPromises = [];
    this.scheduledBatch = null;

    if (batch.length === 0) return;

    try {
      const results = await this.batchFn(batch);

      promises.forEach(({ key, resolve }, index) => {
        const result = results[index];
        if (this.useCache) {
          this.cache.set(key, result);
        }
        resolve(result);
      });
    } catch (error) {
      promises.forEach(({ reject }) => reject(error));
    }
  }

  clearAll() {
    this.cache.clear();
  }

  clear(key) {
    this.cache.delete(key);
  }

  prime(key, value) {
    if (this.useCache) {
      this.cache.set(key, value);
    }
  }
}

// グローバルなDataLoaderインスタンスを保持
const loaderInstances = [];

const DataLoaderMockFactory = jest.fn().mockImplementation((batchFn, options) => {
  const loader = new DataLoaderMock(batchFn, options);

  // Jest spy functionsを追加
  loader.load = jest.fn(loader.load.bind(loader));
  loader.loadMany = jest.fn(loader.loadMany.bind(loader));
  loader.clearAll = jest.fn(loader.clearAll.bind(loader));
  loader.clear = jest.fn(loader.clear.bind(loader));
  loader.prime = jest.fn(loader.prime.bind(loader));

  // インスタンスを保存
  loaderInstances.push(loader);

  return loader;
});

// 全インスタンスのキャッシュをクリア
DataLoaderMockFactory.clearAllInstances = () => {
  loaderInstances.forEach(loader => {
    if (loader && loader.clearAll) {
      loader.clearAll();
    }
  });
  loaderInstances.length = 0;
};

module.exports = DataLoaderMockFactory;