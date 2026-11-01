# ディレクトリ構成と置き場所の決め方

どのコードをどこに置くかの基準。新しいファイルを足すとき、既存のファイルを動かすときはこの基準に合わせる。2026-11-01 時点のコードに合わせて書いている。

## 原則

1. **画面とロジックを分ける。** React に依存するもの（画面・部品・フック・Provider）は `app/` と `components/`、それ以外のロジックは `lib/` に置く
2. **`lib/` は機能ごとに分ける。** 1 つの機能のサービス・定数・型・補助関数は、その機能のディレクトリにまとめる。`lib/utils/`・`lib/constants/`・`lib/config/` と `types/` には、複数の機能で使うものだけを置く
3. **依存は画面 → ロジックの一方向。** `lib/` と `scripts/` から `app/`・`components/` を import しない。eslint の `no-restricted-imports`（`eslint.config.mjs` の `uiLayerImportRestriction`。lint の対象のファイル）と、`__tests__/scripts/import-direction.test.ts`（`lib/`・`scripts/` の全ファイル）が止める
4. **テストはソースと同じパスに置く。** `lib/tags/tag-service.ts` のテストは `__tests__/lib/tags/tag-service.test.ts`

## トップレベル

| ディレクトリ・ファイル | 置くもの |
|------|------|
| `app/` | Next.js のルーティング（ページ・API）と画面のコード |
| `components/` | デザインシステムの部品だけ: shadcn/ui の生成物（`ui/`）、独自の部品（`ui-v2/`）、アイコン（`icons/`） |
| `lib/` | 画面以外のロジック（下の「lib/」） |
| `types/` | 複数の機能で使う型（Prisma のモデルの型・API の応答の型・フェッチャーの型など） |
| `scripts/` | 定期実行のジョブと、手で流すスクリプト（[scripts/README.md](../../scripts/README.md)） |
| `prisma/` | スキーマ・マイグレーション・シード |
| `__tests__/` | テスト（下の「テスト」） |
| `__mocks__/` | Jest のモック。`node_modules` のモジュールのモックはルートに置く必要があるのでここに置く |
| `docs/` | ドキュメント（[docs/README.md](../README.md)） |
| `monitoring/` | ローカルの監視スタック（OpenTelemetry Collector・Loki・Tempo・Grafana）の設定。`docker-compose.otel.yml`・`docker-compose.monitoring.yml` から使う |
| ルートのファイル | ツールがルートに置くことを求める設定（`next.config.ts`・`proxy.ts`・`instrumentation*.ts`・`jest.config.*.js`・`playwright.config.ts`・`eslint.config.mjs`・`tsconfig*.json`・`docker-compose.*.yml`・`Dockerfile*` など） |

## app/

| 場所 | 置くもの |
|------|------|
| `app/<ルート>/page.tsx` など | Next.js のルートのファイル |
| `app/<ルート>/_components/` | その画面だけで使う部品。同じく `_hooks/`・`_types/`・`_config/`・`_data/` のように `_` を付ける（`_` の付いたディレクトリはルートにならない） |
| `app/components/<機能>/` | 複数の画面で使う部品（`article/`・`layout/`・`auth/`・`common/` など） |
| `app/hooks/` | React のフック。ファイル名は `use-xxx.ts` |
| `app/providers/` | React の Provider（認証・React Query・テーマ・トースト） |
| `app/api/<パス>/route.ts` | API。ルート固有の補助は同じディレクトリの `lib/`・`handlers/` に置く（`app/api/articles/lib/` など） |

shadcn/ui の CLI は `components.json` の別名に従い、部品を `components/ui/`、フックを `app/hooks/` に生成する。そのため `components/ui/` の一部（`sidebar.tsx`・`toaster.tsx`）は `app/hooks/` の `use-mobile.ts`・`use-toast.ts` を使う。`components/` から `app/` への依存はこの shadcn のフックだけにする。

## lib/

### 機能ごとのディレクトリ

| ディレクトリ | 内容 |
|------|------|
| `fetchers/` | 記事の収集。ソース別のフェッチャー、ソース別の取得設定（`config/`）、RSS の型、本文の抽出 |
| `enrichers/` | 記事ページからの本文・サムネイルの取得（取得は SSRF を検証する `lib/utils/url/safe-redirect.ts` を通す） |
| `articles/` | 記事の分類（カテゴリ・技術以外の話題の判定）、種類の判定、重複の検出、スコア、ストーリー、サムネイル、手動の追加 |
| `summary/` | 要約の生成の流れ（対象の選び方・バッチ・再生成）、`generation/`（テキスト処理・タグの解析）、`quality/`（手動スクリプト用の品質の判定）、要約の解析、記事の種類ごとのプロンプト |
| `ai/` | LLM との接続（Gemini の設定・アダプター・通信）、本番の要約サービス（`service/`）、差分要約、抽出、翻訳、回帰テスト（`testing/`） |
| `tags/` | タグのサービス・正規化（`tag-normalizer.ts` は正規名とカテゴリ、`tag-input-normalizer.ts` は入力のタグ名を整える関数）・カテゴリ・ラベル |
| `sources/` | ソースの分類・ID・プリセット・色・グループ、会社のソースの提供元（`company-source/`） |
| `trends/` | トレンド分析・急上昇のキーワードと系列・ダッシュボードの集計・日次レポート（`report/`） |
| `personalization/` | 興味の分野・点数の前計算・ダイジェスト |
| `rag/` | 埋め込み・ベクトル検索・エージェント検索・埋め込みのスケジューラ |
| `graph/` | 記事の関連グラフ |
| `favorites/`・`history/`・`comments/`・`inquiries/`・`social-post/`・`changelog/`・`notification/` | それぞれの機能 |

### 基盤のディレクトリ

| ディレクトリ・ファイル | 内容 |
|------|------|
| `prisma.ts`・`prisma-exports.ts`・`prisma/`・`database-config.ts` | Prisma のクライアント（アプリ用のシングルトン・スクリプト用の生成関数）と生成物の再 export |
| `database/` | 複数の機能で使うクエリの部品（有効なソースの絞り込み・タグの件数など） |
| `cache/`・`redis/`・`dataloader/` | キャッシュ・Redis のクライアント・DataLoader |
| `auth/`・`middleware/`・`cookies/`・`routes/` | 認証、API の共通処理（認証・CSRF・レート制限・メンテナンス応答）、Cookie、ルートのパス |
| `config/` | 環境変数（`env.ts`）・機能フラグ・レート制限・セキュリティヘッダ・認証の Cookie |
| `constants/` | 複数の機能で使う定数 |
| `utils/` | 機能に依存しない関数（日付・URL の検証・HTML の無害化・エラーの整形など）。`index.ts` は shadcn/ui の `cn` |
| `logger.ts`・`logger.client.ts`・`metrics/`・`analytics/` | ログ・計測 |
| `cli/`・`di/`・`workers/`・`errors/`・`pagination/`・`api/`・`design-tokens/` | CLI（`npm run techtrend`）、依存の組み立て、ワーカー、共通のエラー、カーソル、API の応答ヘッダ、デザイントークン |

### 新しいファイルをどこに置くか

1. React に依存するなら `app/`（その画面だけなら `app/<ルート>/_components/`、複数の画面なら `app/components/<機能>/`、フックなら `app/hooks/`）
2. 上の表の機能に属するなら、その機能のディレクトリ
3. 新しい機能なら `lib/<機能>/` を作る（`services/` のような種類別の置き場は作らない）
4. どの機能にも依存しない汎用の関数だけを `lib/utils/` に置く。2 つ以上の機能から使われる定数・型は `lib/constants/`・`types/`

## テスト

| 場所 | 置くもの |
|------|------|
| `__tests__/<ソースのパス>` | 単体テスト（`__tests__/lib/...`・`__tests__/app/...`・`__tests__/scripts/...`・`__tests__/types/...`）。ファイル名は `<対象>.test.ts`、同じ対象で観点を分けるときは `<対象>.<観点>.test.ts` |
| `__tests__/api/`・`__tests__/components/`・`__tests__/hooks/` | API のルート・画面の部品・フックのテスト（`app/api/`・`app/components/`・`app/hooks/` に対応） |
| ソースの隣の `__tests__/` | ソースと一緒に読むテスト（`lib/ai/service/__tests__/` など）。どちらに置いてもよい |
| `__tests__/integration/` | 実際の DB と Redis を使う結合テスト（`jest.config.integration.js`） |
| `__tests__/e2e/` | Playwright の E2E。`helpers/`・`utils/`・`constants/`・`fixtures/` は E2E の補助 |
| `__tests__/performance/` | 性能の計測 |
| `__tests__/helpers/`・`__tests__/fixtures/`・`__tests__/__mocks__/` | テストの補助・データ・モック |

`*.db.test.ts` はテスト用の DB を使う単体テスト。表全体を書き換えるものは `jest.config.node.js` の `SERIAL_DB_TEST_PATHS` に入れて直列で流す。

## 型チェックと lint の範囲

- 型チェック（`tsconfig.json`）は `app/`・`components/`・`lib/`・`types/`・`scripts/`・`prisma/` とルートの設定を対象にする。除外はテスト・モック・生成物だけ
- lint は `app/`・`components/`・`lib/`・`scripts/scheduled/` が対象。手で流すスクリプト（`scripts/` のほかのディレクトリ）は対象外（`eslint.config.mjs` の `globalIgnores`）
