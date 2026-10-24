# TechTrend CLI

運用のための管理ツール。コマンドの登録は `lib/cli/index.ts`、各コマンドは `lib/cli/commands/` にある。収集・品質スコア・タグの掃除は、定期実行と同じ `scripts/scheduled/` のスクリプトを子プロセスで起動する。

## 使用方法

```bash
# ヘルプの表示
npm run techtrend -- --help
npm run techtrend -- <コマンド> --help

# ローカルの DB を使うときは env を読み込ませる
npx dotenv run -- tsx lib/cli/index.ts <コマンド>
```

`package.json` に `bin` は無いので、`npx techtrend` では動かない。

## コマンド一覧

### feeds - フィード

```bash
npm run techtrend -- feeds collect "Dev.to" "Qiita"   # 指定したソースから収集
npm run techtrend -- feeds collect --all              # すべてのソースから収集
npm run techtrend -- feeds sources                    # ソース一覧
npm run techtrend -- feeds stats --days 7             # 収集の統計
```

### summaries - 要約

```bash
npm run techtrend -- summaries generate --source "Dev.to" --limit 100 --batch-size 10
npm run techtrend -- summaries regenerate --days 7 --force --batch 10
npm run techtrend -- summaries check
```

### quality-scores - 品質スコア

```bash
npm run techtrend -- quality-scores calculate --source "Dev.to"   # scripts/scheduled/manage-quality-scores.ts calculate
npm run techtrend -- quality-scores calculate --recalculate       # 採点済みの記事も計算し直す（同 calculate --force）
npm run techtrend -- quality-scores fix                           # スコアが 0 の記事を直す（同 fix-zero）
npm run techtrend -- quality-scores stats
```

### tags - タグ

```bash
npm run techtrend -- tags list --category <カテゴリ> --limit 50
npm run techtrend -- tags stats
npm run techtrend -- tags clean --dry-run
npm run techtrend -- tags categorize --overwrite --dry-run
```

### cleanup - データの掃除

```bash
npm run techtrend -- cleanup tags --dry-run   # 空のタグや重複タグ（scripts/scheduled/clean-tags.ts）
npm run techtrend -- cleanup stats
```

### db - DB

```bash
npm run techtrend -- db stats   # 主要テーブルの件数と最新記事日時
```

## 新しいコマンドの追加

1. `lib/cli/commands/` にコマンドのファイルを作る（Commander の `Command` を export する）
2. `lib/cli/index.ts` で `program.addCommand()` に登録する
3. テストは `__tests__/unit/lib/cli.test.ts`・`__tests__/lib/cli/commands/` にある
