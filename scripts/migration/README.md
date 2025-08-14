# 移行スクリプト

このディレクトリには、データベースやシステムの移行スクリプトが含まれています。

## migrate-to-v7.ts

summaryVersion 7への移行スクリプトです。既存の記事の要約を新しいフォーマットで再生成します。

### 特徴

- AIが記事内容に応じて項目名を自由に設定
- 固定5項目（核心、背景、解決策、実装、効果）から柔軟な項目設定へ
- 一覧要約と詳細要約の両方を再生成（一貫性のため）

### 使用方法

```bash
# 基本的な実行
npx tsx scripts/migration/migrate-to-v7.ts

# ドライラン（実際の更新なし）
npx tsx scripts/migration/migrate-to-v7.ts --dry-run

# 処理件数を制限
npx tsx scripts/migration/migrate-to-v7.ts --limit=100

# 中断後の再開
npx tsx scripts/migration/migrate-to-v7.ts --continue

# 特定ソースのみ（SourceのIDを指定）
npx tsx scripts/migration/migrate-to-v7.ts --source=cmdq3nww70003tegxm78oydnb

# 組み合わせ
npx tsx scripts/migration/migrate-to-v7.ts --continue --limit=50
```

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--dry-run` | 実際の更新を行わずにシミュレーション | false |
| `--limit=N` | 処理件数を制限 | 無制限 |
| `--continue` | 前回の中断位置から再開 | false |
| `--source=ID` | 特定ソースの記事のみ処理（SourceテーブルのIDを指定） | すべて |
| `--skip-backup` | バックアップ確認をスキップ（非推奨） | false |

### 処理の特徴

1. **バッチ処理**: 10件ずつ処理
2. **Rate Limit対策**: 
   - 記事間: 1秒待機
   - バッチ間: 5秒待機
   - 100件ごと: 30秒の長期待機
   - Rate Limitエラー時: 60秒待機して再試行
3. **進捗管理**: 中断しても再開可能
4. **ログ記録**: 処理内容をファイルに記録

### バックアップ

実行前に必ずデータベースのバックアップを作成してください：

```bash
cp prisma/dev.db prisma/backup/dev_$(date +%Y%m%d_%H%M%S).db
```

### 進捗ファイル

- `.migration-v7-progress.json`: 進捗情報（自動作成・削除）
- `migration-v7-YYYY-MM-DD.log`: 処理ログ

### 注意事項

- Gemini APIのRate Limitに注意
- 大量の記事がある場合は時間がかかります（1681件で約3-4時間）
- エラーが発生しても処理は継続されます
- Ctrl+Cで中断可能（`--continue`で再開）

### 主要なSourceのID

| Source名 | ID | 記事数（概算） |
|---------|-----|------------|
| はてなブックマーク | cmdq3nww60000tegxi8ruki95 | 多数 |
| Zenn | cmdq3nwwp0006tegxz53w9zva | 多数 |
| AWS | cmdq4382o0000tecrle79yxxl | 多数 |
| Dev.to | cmdq3nww70003tegxm78oydnb | 多数 |
| Speaker Deck | speakerdeck_8a450c43f9418ff6 | 多数 |
| Qiita Popular | cmdq440c90000tewuti7ng0un | 多数 |