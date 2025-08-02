# GitHub Actions Workflows

このディレクトリには、CI/CDパイプライン用のGitHub Actionsワークフローが含まれています。

## ワークフロー

### CI (ci.yml)
- **目的**: コードの品質とテストの自動実行
- **トリガー**: 
  - pushイベント（main, develop, feature/**ブランチ）
  - pull_requestイベント（main, developブランチ）
- **ジョブ**:
  - **Test**: Node.js 18.xと20.xでのテスト実行とカバレッジレポート
  - **Lint**: ESLintとTypeScriptの型チェック
  - **Build**: Next.jsアプリケーションのビルド

### CodeQL (codeql.yml)
- **目的**: セキュリティ脆弱性の自動検出
- **トリガー**:
  - pushイベント（main, developブランチ）
  - pull_requestイベント（mainブランチ）
  - 毎週月曜日8時（スケジュール実行）
- **分析対象**: JavaScript/TypeScriptコード

## バッジ

READMEに以下のバッジを追加できます：

```markdown
![CI](https://github.com/[your-username]/techtrend/workflows/CI/badge.svg)
![CodeQL](https://github.com/[your-username]/techtrend/workflows/CodeQL/badge.svg)
[![codecov](https://codecov.io/gh/[your-username]/techtrend/branch/main/graph/badge.svg)](https://codecov.io/gh/[your-username]/techtrend)
```

## ローカルでのテスト実行

```bash
# テストの実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# Lint実行
npm run lint

# TypeScriptチェック
npm run type-check

# ビルド
npm run build
```