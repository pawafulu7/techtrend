# ドキュメント

| ディレクトリ | 内容 |
|------|------|
| [architecture/](./architecture/README.md) | 構成図・機能一覧・データモデル・ディレクトリ構成の基準・キャッシュの無効化の方針 |
| [development/](./development/) | 開発の手順と規約 |
| [operations/](./operations/) | 本番の運用手順・検証の記録 |
| [guides/](./guides/) | 利用者向けの機能の説明 |

## development/

- [database-migrations.md](./development/database-migrations.md) — マイグレーションの作り方と本番への適用
- [tag-guidelines.md](./development/tag-guidelines.md) — タグとソースの役割分担、タグの付け方
- [e2e-testid-naming.md](./development/e2e-testid-naming.md) — E2E の `data-testid` の命名
- [e2e-debugging.md](./development/e2e-debugging.md) — E2E が失敗したときの調べ方
- [wsl2-external-access.md](./development/wsl2-external-access.md) — WSL2 の開発サーバーにほかの PC から接続する

## operations/

- [deployment.md](./operations/deployment.md) — Vercel へのデプロイ、本番に必要な環境変数
- [email-setup.md](./operations/email-setup.md) — 確認メールの送信の設定
- [schema-integrity.md](./operations/schema-integrity.md) — スキーマとマイグレーションの整合性の検証
- [rag-embedding-lifecycle.md](./operations/rag-embedding-lifecycle.md)・[rag-rollback-procedure.md](./operations/rag-rollback-procedure.md) — 埋め込みの運用と RAG の切り戻し
- [phase2a/](./operations/phase2a/) — 会社のソースを DB から読む切り替え（`USE_DATABASE_PROVIDER`）の移行・監視・切り戻しの手順
- [issue-715-cache.md](./operations/issue-715-cache.md)・[milestone-1-improvements.md](./operations/milestone-1-improvements.md) — 改善の検証の記録

## guides/

- [agent-search.md](./guides/agent-search.md) — AI エージェント検索の使い方

ほかのディレクトリにある説明: [README.md](../README.md)（概要・環境変数・開発サーバー）、[scripts/README.md](../scripts/README.md)（スクリプト）、[__tests__/README.md](../__tests__/README.md)（テスト）、[lib/cli/README.md](../lib/cli/README.md)（CLI）、[components/ui-v2/README.md](../components/ui-v2/README.md)（デザインシステムの部品）、[.github/workflows/README.md](../.github/workflows/README.md)（GitHub Actions）。
