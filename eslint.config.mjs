import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      // TypeScript厳密性ルール
      '@typescript-eslint/no-explicit-any': 'warn', // 段階的に'error'に移行
      '@typescript-eslint/explicit-function-return-type': 'off', // 推論可能な場合は不要
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      
      // コード品質ルール
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      
      // React関連
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
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
      '*.tsbuildinfo',
      'next-env.d.ts'
    ],
  },
];

export default eslintConfig;
