# scripts

スクリプトは「どう実行されるか」で分ける。

```
scripts/
├── scheduled/     GitHub Actions から定期実行するジョブ（utils/ はジョブ間の共通部品）
├── ci/            CI と要約の回帰テスト（golden set）
├── maintenance/   手で流すデータの保守（DB を書き換える）。utils/ は共通部品
├── analysis/      手で流す調査・計測（DB を書き換えない。結果はファイルか標準出力）
├── db/            DB の操作（バックアップ・本番との同期・本番のマイグレーション・テストユーザー）
├── docker/        Docker の補助（DB の初期化 SQL・テスト用の起動スクリプト・DB の再起動）
├── dev/           開発の補助（デザイントークンの生成・色の lint・接続の確認・ngrok）
├── test/          テスト用 DB の準備
└── lib/           スクリプト間で共有する部品
```

- 定期実行のジョブは必ず `scheduled/` に置き、`.github/workflows/scheduler-*.yml` から呼ぶ。lint の対象になる（ほかのディレクトリは lint の対象外。型チェックは全ディレクトリが対象）
- 読み取りだけの調査は `analysis/`、データを書き換えるものは `maintenance/`。迷ったら DB に書くかどうかで決める
- 一時的な実験は `scripts/temp/`（`.gitignore` 済み）に置き、終わったら消す
- 計測の結果は `metrics-reports/`（`.gitignore` 済み）に書く

## 実行のしかた

```bash
npx tsx scripts/<ディレクトリ>/<名前>.ts            # DATABASE_URL などは環境変数から読む
npx dotenv run -- tsx scripts/<ディレクトリ>/<名前>.ts  # .env を読み込んで動かす
```

よく使うものは `package.json` にコマンドがある（`npm run scripts:collect`・`npm run quality:check`・`npm run backfill:embeddings` など）。本番の DB に向けるときは `bash scripts/db/with-prod-db.sh --as-database-url <コマンド>`（接続先と生の出力は表示しない）。

## 主なスクリプト

### scheduled/（定期実行）

| スクリプト | ワークフロー |
|------|------|
| `collect-feeds.ts` | `scheduler-rss-hourly.yml`・`scheduler-qiita.yml`・`scheduler-scraping.yml` |
| `manage-summaries.ts` | `scheduler-qiita.yml`・`scheduler-scraping.yml`・`scheduler-quality-auto.yml` |
| `generate-summaries.ts` | `collect-feeds.ts` が新着の記事の要約に呼ぶ（`npm run scripts:summarize` でも動かす） |
| `manage-quality-scores.ts` | `scheduler-qiita.yml`・`scheduler-scraping.yml`・`scheduler-daily-quality.yml` |
| `quality-check.ts`・`auto-regenerate-low-quality.ts` | `scheduler-quality-auto.yml` |
| `generate-tags.ts` | `scheduler-tags.yml` |
| `clean-tags.ts` | `scheduler-cleanup.yml` |
| `check-tag-quality.ts` | `tag-quality-check.yml` |
| `generate-trend-report.ts` | `scheduler-trend-report.yml` |
| `generate-diff-summaries.ts` | `scheduler-diff-summary.yml` |
| `run-embedding-worker.ts`・`recover-stuck-embeddings.ts`・`assign-stories.ts` | `scheduler-embedding-worker.yml` |
| `refresh-personalization.ts` | `scheduler-personalization.yml` |
| `classify-off-topic.ts` | `scheduler-off-topic.yml` |
| `collect-changelog.ts` | `scheduler-changelog.yml` |
| `fix-missing-translations.ts` | `scheduler-translation-fix.yml` |

どのワークフローがどのスクリプトを呼ぶかの正本は `.github/workflows/`（一覧は [docs/architecture/05-features.md](../docs/architecture/05-features.md)）。

### ci/

- `run-golden-set-regression.ts` — 要約の回帰テスト（`npm run regression`）
- `calibrate-thresholds.ts` — 回帰テストのしきい値の較正（`npm run calibrate`）

### db/

- `with-prod-db.sh` — 本番の DB に向けてコマンドを流す
- `deploy-migrations.sh` — 本番にマイグレーションを適用する（`npm run migrate:production`）
- `sync-prod.sh`・`backup-dev.sh`・`backup-test.sh`・`clear-local-cache.sh` — `npm run db:*` から使う

## 追加するとき

1. 上の分け方でディレクトリを選ぶ
2. ファイル名は動詞で始まる kebab-case（`regenerate-low-quality-summaries.ts`）
3. 冒頭のコメントに目的と使い方（引数・`--dry-run` の有無）を書く
4. よく使うなら `package.json` にコマンドを足す
