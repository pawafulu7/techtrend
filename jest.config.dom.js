// DOM/React環境用のJest設定（コンポーネントテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  rootDir: './',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.dom.js'],
  testEnvironment: 'jsdom',
  reporters: [
    'default',
    // CI環境でのみCTRFレポートを生成（Flaky Test検出用）
    ...(process.env.CI
      ? [['jest-ctrf-json-reporter', { outputFile: 'jest-dom-ctrf-report.json', outputDir: 'ctrf' }]]
      : []),
  ],
  moduleNameMapper: {
    // CSS modules
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Image imports
    '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Mock Next.js modules
    '^next/navigation$': '<rootDir>/__mocks__/next/navigation.ts',
    '^next/image$': '<rootDir>/__mocks__/next/image.tsx',
    '^next/link$': '<rootDir>/__mocks__/next/link.tsx',
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
    // Mock Prisma client
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/prisma$': '<rootDir>/__mocks__/lib/prisma.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
    '<rootDir>/e2e/',
    // FavoriteButtonテストはNode環境専用なのでDOM環境では除外
    '<rootDir>/components/article/__tests__/FavoriteButton.test.tsx',
    // window.location操作を含むテストはDOM環境では除外（jsdom制限）
    '<rootDir>/app/components/article/__tests__/ArticleCard.test.tsx',
    // Node環境専用テスト（.node.test.ts）をDOM環境では除外（CodexMCP推奨）
    '\\.node\\.test\\.(t|j)sx?$',
    // API/Server/Integration tests: Node環境専用のためDOM環境では除外
    '<rootDir>/__tests__/api/',
    '<rootDir>/app/api/__tests__/',
    '<rootDir>/__tests__/integration/',
    '<rootDir>/__tests__/performance/',
    // Enricher/Fetcherテスト: Cheerio（Node専用）使用のためDOM環境では除外
    '<rootDir>/__tests__/enrichers/',
    '<rootDir>/lib/enrichers/__tests__/',
    '<rootDir>/__tests__/fetchers/',
    '<rootDir>/lib/fetchers/__tests__/',
    '<rootDir>/__tests__/manual/',
    // Service/DB/Cacheテスト: Node環境専用
    '<rootDir>/__tests__/services/',
    '<rootDir>/lib/services/__tests__/',
    '<rootDir>/__tests__/security/',
    '<rootDir>/__tests__/middleware.node.test.ts',
  ],
  testMatch: [
    '**/__tests__/**/*.test.tsx',
    '**/app/components/**/__tests__/**/*.test.tsx',
    '**/components/**/__tests__/**/*.test.tsx',
    '**/__tests__/components/**/*.test.tsx',
    '**/__tests__/hooks/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    'app/**/*.tsx',
    'components/**/*.tsx',
    '!**/*.d.ts',
    '!**/*.config.{js,ts}',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};

const nextJestConfig = createJestConfig(customJestConfig);
const esmAllowList = [
  'react-markdown',
  'remark-.*',
  'rehype-.*',
  'unified',
  'unist-.*',
  'mdast-.*',
  'micromark.*',
  'hast-.*',
  'estree-.*',
  'hastscript',
  'property-information',
  'space-separated-tokens',
  'comma-separated-tokens',
  'trim-lines',
  'vfile.*',
  'devlop',
  'ccount',
  'bail',
  'zwitch',
  'trough',
  'is-plain-obj',
  'html-url-attributes',
  'markdown-table',
  'longest-streak',
  'mdurl',
  'decode-named-character-reference',
  'character-entities.*',
  'escape-string-regexp',
  'jsdom',
  'parse5',
];
const esmPattern = esmAllowList.join('|');

module.exports = async () => {
  const config = await nextJestConfig();
  return {
    ...config,
    transformIgnorePatterns: [
      `/node_modules/(?!(?:${esmPattern})/)`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
