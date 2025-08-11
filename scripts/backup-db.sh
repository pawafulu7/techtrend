#!/bin/bash

# データベースバックアップスクリプト
# 使用方法: ./scripts/backup-db.sh

BACKUP_DIR="prisma/backup"
DB_FILE="prisma/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dev_${TIMESTAMP}.db"

# バックアップディレクトリが存在しない場合は作成
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    echo "Created backup directory: $BACKUP_DIR"
fi

# データベースファイルが存在するか確認
if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file not found: $DB_FILE"
    exit 1
fi

# バックアップ実行
cp "$DB_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup successful: $BACKUP_FILE"
    echo "File size: $(ls -lh $BACKUP_FILE | awk '{print $5}')"
    
    # 古いバックアップを削除（7日以上前のもの）
    find "$BACKUP_DIR" -name "dev_*.db" -mtime +7 -delete
    echo "Cleaned up old backups (older than 7 days)"
else
    echo "Error: Backup failed"
    exit 1
fi