# TechTrend バックアップポリシー

## 更新日
2025年8月7日

## バックアップ方針

### 1. 自動バックアップ
- **保存先**: `prisma/backups/auto/`
- **保持期間**: 7日間
- **命名規則**: `dev_YYYYMMDD_HHMMSS.db`
- **実行タイミング**: 
  - backup.shスクリプト実行時
  - 重要な操作前の手動実行
- **自動削除**: 7日経過後に自動削除

### 2. 手動バックアップ（マイルストーン）
- **保存先**: `prisma/backups/manual/`
- **保持期間**: 永続保持
- **命名規則**: `dev_YYYYMMDD_HHMMSS_description.db`
- **対象**:
  - リリース前のバックアップ
  - 大規模リファクタリング前
  - 重要な機能実装前後
  - Phase完了時点

### 3. ディレクトリ構造
```
prisma/
├── dev.db                    # メインDB（現在使用中）
└── backups/
    ├── auto/                 # 自動バックアップ（7日保持）
    │   └── dev_*.db
    └── manual/               # 手動バックアップ（永続保持）
        └── dev_*_description.db
```

## バックアップ実行

### 自動バックアップの作成
```bash
# scripts/utils/backup.sh を実行
bash scripts/utils/backup.sh
```

### 手動バックアップの作成
```bash
# 重要なマイルストーンでのバックアップ
cp prisma/dev.db prisma/backups/manual/dev_$(date +%Y%m%d_%H%M%S)_<description>.db

# 例：
cp prisma/dev.db prisma/backups/manual/dev_20250807_120000_before_major_refactoring.db
```

## クリーンアップ

### 定期クリーンアップ
- **実行タイミング**: 週次（日曜日22時）
- **実行スクリプト**: `scripts/utils/cleanup-db.sh`
- **処理内容**:
  - 空DBファイルの削除
  - 7日以前の自動バックアップ削除
  - ディスク使用量の報告

### 手動クリーンアップ
```bash
bash scripts/utils/cleanup-db.sh
```

## リストア手順

### 最新の自動バックアップから復元
```bash
# 最新のバックアップを確認
ls -lt prisma/backups/auto/*.db | head -1

# 現在のDBをバックアップ
cp prisma/dev.db prisma/dev.db.before_restore

# リストア実行
cp prisma/backups/auto/<latest_backup>.db prisma/dev.db
```

### 特定のマイルストーンから復元
```bash
# マイルストーンバックアップを確認
ls -la prisma/backups/manual/*.db

# リストア実行
cp prisma/backups/manual/<milestone_backup>.db prisma/dev.db
```

## 注意事項

1. **本番環境での運用**
   - 本番環境では保持期間を30日以上に設定推奨
   - 定期的な外部バックアップの実施

2. **ディスク容量管理**
   - バックアップ総容量が50MBを超えた場合は古いマイルストーンの見直し
   - 不要な手動バックアップの定期的な確認

3. **セキュリティ**
   - バックアップファイルには機密情報が含まれる可能性
   - Gitには含めない（.gitignoreで除外）
   - 必要に応じて暗号化を検討

## 関連ファイル
- `scripts/utils/backup.sh` - バックアップスクリプト
- `scripts/utils/cleanup-db.sh` - クリーンアップスクリプト
- `scheduler-v2.ts` - 自動実行スケジューラー