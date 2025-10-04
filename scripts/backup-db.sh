#!/bin/bash

# DBバックアップスクリプト
# 使用方法: ./scripts/backup-db.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"

# バックアップディレクトリ作成
mkdir -p ${BACKUP_DIR}

echo "データベースバックアップを開始します..."
echo "タイムスタンプ: ${TIMESTAMP}"

# PostgreSQLバックアップ実行
docker exec techtrend-postgres pg_dump -U postgres techtrend_dev > ${BACKUP_FILE}

# バックアップファイルサイズ確認
FILE_SIZE=$(du -h ${BACKUP_FILE} | cut -f1)

echo "バックアップ完了"
echo "ファイル: ${BACKUP_FILE}"
echo "サイズ: ${FILE_SIZE}"

# 過去のバックアップファイル一覧（最新5件）
echo ""
echo "最新のバックアップファイル一覧:"
if compgen -G "${BACKUP_DIR}/*.sql" > /dev/null; then
  ls -lth "${BACKUP_DIR}"/*.sql | head -5
else
  echo "バックアップファイルがありません"
fi