/**
 * E2Eテスト用のテストデータ
 */

export const testData = {
  // 検索テスト用のクエリ
  searchQueries: {
    valid: 'TypeScript',
    noResults: 'xyzabc123456',
    special: 'React & Next.js',
  },

  // フィルタリングテスト用のデータ
  filters: {
    sources: ['Dev.to', 'Qiita', 'Zenn'],
    tags: ['javascript', 'typescript', 'react'],
    qualityScoreMin: 50,
    qualityScoreMax: 100,
  },

  // ページネーションテスト用
  pagination: {
    itemsPerPage: 20,
    maxPages: 5,
  },

  // タイムアウト設定（環境変数で上書き可能）
  timeouts: {
    short: Number(process.env.TEST_TIMEOUT_SHORT) || 5000,
    medium: Number(process.env.TEST_TIMEOUT_MEDIUM) || 10000,
    long: Number(process.env.TEST_TIMEOUT_LONG) || 30000,
  },

  // URLパス
  paths: {
    home: '/',
    articles: '/articles',
    sources: '/sources',
    tags: '/tags',
    search: '/search',
    popular: '/popular',
    stats: '/stats',
  },
};