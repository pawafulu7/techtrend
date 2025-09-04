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

  // タイムアウト設定
  timeouts: {
    short: 5000,
    medium: 10000,
    long: 30000,
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