import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // グローバル ignores を最初に設定
  {
    ignores: [
      '**/__mocks__/**',
      '**/__tests__/**',
      '**/node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      '.backup/**',
      'tmp/**',
      'temp/**',
      'test/**',
      'test_debug.ts',
      'test_*.ts',
      '**/test-*.ts',
      'testStability.ts',
      '*.tsbuildinfo',
      'next-env.d.ts',
      // E2Eテスト（全除外）
      'e2e/**',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      // 設定ファイル系
      '*.config.js',
      'ecosystem*.js',
      'jest.*.js',
      'playwright.config.ts',
      // スクリプト系（全除外）
      'scripts/**',
      'prisma/seed.ts',
      'prisma/seed-*.ts',
      // hooks（テスト用）
      'hooks/use-toast.ts',
      'hooks/useSession.ts',
      // 一時ファイル・テストファイル
      'test-*.js',
      'test-*.ts',
      '*-test.js',
      '*-test.ts',
      // 注意: .js は全面除外しない（設定/スクリプトもLint対象にする）
      // Playwrightレポート
      'playwright-report/**',
      'test-results/**',
      // 型定義ファイル（使用量管理不要）
      'types/**'
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      // TypeScript厳密性ルール - 緩和設定
      '@typescript-eslint/no-explicit-any': 'off', // モックファイル等で大量使用のため一時的にoff
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {  // errorからwarnに緩和
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],

      // コード品質ルール
      'no-console': 'off', // デバッグ時に必要なため一時的にoff
      'prefer-const': 'warn',
      'no-var': 'warn',

      // React関連
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default eslintConfig;
