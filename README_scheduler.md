# TechTrend 自動更新スケジューラー

## 概要
1時間ごとに各技術系サイトから最新記事を自動取得し、要約を生成するスケジューラーです。

## 機能
- **自動実行**: 毎時0分に自動実行（例: 1:00, 2:00, 3:00...）
- **重複チェック**: URLまたはexternalIdで重複を防止
- **要約生成**: 新規記事に対して自動的に日本語要約を生成
- **エラー処理**: 各ソースでエラーが発生しても他のソースの処理を継続

## 使い方

### 開発環境での実行
```bash
# 環境変数を設定
export GEMINI_API_KEY="your-api-key"

# スケジューラーを実行（フォアグラウンド）
npm run scheduler:dev
```

### 本番環境での実行（PM2使用）
```bash
# PM2でスケジューラーを開始
npm run scheduler:start

# スケジューラーを停止
npm run scheduler:stop

# スケジューラーを再起動
npm run scheduler:restart

# ログを確認
npm run scheduler:logs
```

### 手動実行
```bash
# フィード収集のみ
node scripts/collect-feeds.js

# 要約生成のみ
node scripts/generate-summaries.js
```

## ログ
PM2実行時のログは以下に保存されます：
- `logs/scheduler-out.log`: 標準出力
- `logs/scheduler-error.log`: エラー出力
- `logs/scheduler-combined.log`: 統合ログ

## 注意事項
- GEMINI_API_KEYの設定が必要です
- API制限を考慮し、要約生成は5件ずつバッチ処理されます
- 1回の実行で最大100件の新規記事に要約を生成します