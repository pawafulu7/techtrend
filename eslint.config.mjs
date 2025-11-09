import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // Global ignores first
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
      'e2e/**',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '*.config.js',
      'ecosystem*.js',
      'jest.*.js',
      'playwright.config.ts',
      'scripts/**',
      'prisma/seed.ts',
      'prisma/seed-*.ts',
      'hooks/use-toast.ts',
      'hooks/useSession.ts',
      'test-*.js',
      'test-*.ts',
      '*-test.js',
      '*-test.ts',
      'playwright-report/**',
      'test-results/**',
      'types/**'
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("next/typescript"),
  ...compat.extends("prettier"),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default eslintConfig;
