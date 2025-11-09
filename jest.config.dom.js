// DOM/React環境用のJest設定（コンポーネントテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  rootDir: './',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.dom.js'],
  testEnvironment: 'jsdom',
  reporters: ['default'],
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
    // Mock next-auth
    '^next-auth/react$': '<rootDir>/__mocks__/next-auth/react.ts',
    '^next-auth$': '<rootDir>/__mocks__/next-auth/index.ts',
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
    // Mock Prisma client
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
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
    '<rootDir>/app/components/article/__tests__/ArticleListItem.test.tsx',
    // Node環境専用テスト（.node.test.ts）をDOM環境では除外（CodexMCP推奨）
    '\\.node\\.test\\.(t|j)sx?$',
  ],
  testMatch: [
    '**/__tests__/**/*.test.tsx',
    '**/tests/**/*.test.tsx',
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
