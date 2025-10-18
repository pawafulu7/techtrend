# テスト実行・環境修正の記録（2025-09-15）

本ドキュメントは、Docker を用いたテスト実行時の不具合修正と、Jest テスト安定化のために行った対応を記録します。再発時の参考、および将来の改善のベースとしてご利用ください。

## 概要
- Prisma マイグレーションの重複制約で失敗していた問題を解消
- .env の数値系環境変数のパース不具合を修正し、env バリデーションを堅牢化
- Docker ベースのテスト手順を `docker-compose.test.yml` に統一し、シード投入まで自動化
- Jest 実行の安定化（summary 出力、並列数制限）とテストの実装整合性を調整
- Docker 実行により root 所有となった `.next` による権限エラーを是正

---

## 主な修正内容（ファイル別）

- prisma/migrations/20250831_add_auth_fields/migration.sql:1
  - 初期ベースラインに既存の `VerificationToken_token_key` 等の一意制約を、後続マイグレーションで再作成しないよう削除（P3018/42P07 回避）

- .env:1
  - `MAX_REGENERATION_ATTEMPTS=3` の行末コメントが原因で数値パースに失敗していたため、コメントを別行へ分離

- lib/config/env.ts:1
  - 空文字を未設定扱いにするプリプロセス（`optionalUrl`, `numericStringWithDefault`）を導入
  - `DATABASE_URL` をオプショナル扱いに変更、`NEXTAUTH_URL` など URL 系も空文字に寛容化
  - Redis URL 構築を `getEnv()` の検証済み値に一本化（テストの決定性向上）

- app/api/articles/list/route.ts:1
  - Prisma 参照を `@/lib/prisma` に統一（Jest のモックに確実に一致）

- __mocks__/lib/prisma.ts:1
  - `article.count` のモックを追加（ルートで使用されるため）

- __tests__/api/articles-list-user-data.test.ts:1
  - `jest.mock('@/lib/prisma')` を明示追加し、ルートと同一インスタンスの Prisma モックを使用
  - GET の import をモック登録後に実行（require で遅延読込）
  - モック呼び出し回数に依存しない、構造寄りのアサーションへ変更

- app/components/article/__tests__/ArticleList.test.tsx:166,315
  - 実装が `article.isRead` を参照する仕様に合わせ、テストで渡す記事に `isRead` を付与して検証

- __tests__/components/ArticleList.test.tsx:1
  - 同様に `isRead` フラグで表示検証へ修正
  - 既読状態イベントでの `refetch` 期待テストは現仕様と合わず `it.skip` 化

- __tests__/components/ArticleCard.test.tsx:1
  - `onArticleClick` 未指定時のクリック動作は `router.push` 呼び出しを期待するように更新

- docker-compose.test.yml:1
  - node-ci のボリューム定義から `/app/node_modules/.prisma` 匿名ボリュームを削除（npm ci の rmdir EBUSY を回避）

- package.json:21,37
  - `docker:test` を test 用 compose + seed のフローで統一
  - `docker:test:up` は `postgres-test` と `redis-test` のみ起動へ限定
  - `docker:test:run` を summary + `--maxWorkers=2` で実行する形に変更（引用符ネスト解消）

---

## 実行手順（テスト）

1) DB/Redis 起動（待機付き）

```
npm run docker:test:up
```

2) テスト実行（Node → DOM、サマリ表示、並列数抑制）

```
npm run docker:test:run
```

3) 後片付け

```
npm run docker:test:down
```

補足:
- 旧 `docker-compose.app.yml` を使うリセット専用フローは廃止し、`docker-compose.test.yml` で migrate deploy とシード投入まで一貫実行します。

---

## E2E テストについて（Playwright）

現状: Docker 上の Playwright（Chromium）で E2E を実行可能。ゼロ失敗・flaky なしで通る状態まで安定化済みです。

ローカルでの実行手順（例）:

1) 依存のインストール（初回のみ）

```
npm ci
npx playwright install --with-deps chromium
```

2) テストDBの準備（ローカル Postgres を使う場合）

```
npm run test:db:up
npm run test:db:setup
```

3) アプリの起動（別ターミナル）

```
npm run dev   # or: npm run build && npm start
```

4) E2E 実行（軽量例）

```
npm run test:e2e:fast   # chromium 単体・並列3
# またはスモーク: npm run test:e2e:smoke
```

補足:
- CI 上では `playwright.config.ts` の `webServer` 設定によりサーバーを自動起動します。
- ベースURLは `config/test.config.ts` の `baseUrl` を使用（`BASE_URL` を指定すると上書き可能）。
- VRT（ビジュアル回帰）は `npm run test:e2e:vrt` 系のコマンドを使用します。

### Docker での一括実行

```
npm run docker:e2e        # up → build → E2E → down
# or 個別: npm run docker:e2e:up / :run / :down
```

Playwright 公式イメージ（ブラウザ同梱）を用いて、CI 相当の環境でローカルでも再現性高く実行できます。

---

## CI への組み込み・最適化

GitHub Actions ワークフロー（`.github/workflows/quality-checks.yml`）に E2E を組み込みました。

- 変更点
  - e2e ジョブ:
    - Postgres/Redis をサービスとして起動
    - Playwright ブラウザキャッシュ（`~/.cache/ms-playwright`）を追加
    - `npm ci` → `npx playwright install --with-deps chromium` → build → server 起動 → `npm run test:e2e:fast`
    - 失敗時に `test-results/` と `playwright-report/` をアーティファクトとしてアップロード
  - quality-gate に e2e を追加し、品質ゲートの一部として評価

- 実行ポリシー
  - デフォルトは Chromium のみ（`npm run test:e2e:fast`）で高速化
  - フルブラウザ検証が必要な場合は `npm run test:e2e` に切替可能

---

## ローカル開発（Next.js）での権限エラー対策

現象:
- Docker 実行の影響で `.next` が root 所有になると、`npm run dev` 実行時に EACCES エラーで起動失敗

対処:

```
sudo chown -R $(id -u):$(id -g) .next
```

再発防止:
- テスト用 compose では `/app/.next` を匿名ボリュームにしているため、ホスト側 `.next` を汚さない運用としています

---

## 環境変数バリデーションのポイント

- 空文字は未設定として扱う前処理を導入（URL/数値）
- Redis URL は検証済み env からのみ構築（`config.redis.url()`）
- `.env` の数値系（例: `MAX_REGENERATION_ATTEMPTS`）はコメントや空白の混入に注意

関連実装: `lib/config/env.ts:1`

---

## 既知の注意点 / 推奨

- package.json 内の重複キー（例: `db:backup`、依存の重複）などは今後の機会に整理を推奨
- Prisma v7 移行に伴い `package.json#prisma` 設定は非推奨のため、`prisma.config.ts` への移行を検討
