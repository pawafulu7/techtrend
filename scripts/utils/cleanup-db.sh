#!/bin/bash
# DBファイルクリーンアップスクリプト
# 作成日: 2025/08/07
# 目的: 不要なDBファイルの定期的なクリーンアップ

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
AUTO_BACKUP_DIR="prisma/backups/auto"
MANUAL_BACKUP_DIR="prisma/backups/manual"
RETENTION_DAYS=7

# 色付きメッセージ
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== DBクリーンアップ開始 ===${NC}"
echo "タイムスタンプ: $TIMESTAMP"

# 空DBファイルの削除
echo -e "${YELLOW}空DBファイルをチェック中...${NC}"
for file in techtrend.db development.db dev.db; do
  if [ -f "$file" ] && [ ! -s "$file" ]; then
    rm -f "$file"
    echo -e "${GREEN}✓ 削除: $file${NC}"
  fi
done

# prismaディレクトリ内の空DBファイル削除
if [ -f "prisma/techtrend.db" ] && [ ! -s "prisma/techtrend.db" ]; then
  rm -f "prisma/techtrend.db"
  echo -e "${GREEN}✓ 削除: prisma/techtrend.db${NC}"
fi

# 古い自動バックアップの削除
echo -e "${YELLOW}${RETENTION_DAYS}日以前の自動バックアップを削除中...${NC}"
if [ -d "$AUTO_BACKUP_DIR" ]; then
  find "$AUTO_BACKUP_DIR" -name "dev_*.db" -mtime +${RETENTION_DAYS} -delete
  echo -e "${GREEN}✓ 古い自動バックアップを削除${NC}"
fi

# 統計情報の表示
echo -e "\n${GREEN}=== クリーンアップ統計 ===${NC}"
if [ -d "$AUTO_BACKUP_DIR" ]; then
  AUTO_COUNT=$(ls -1 "$AUTO_BACKUP_DIR"/*.db 2>/dev/null | wc -l)
  echo "自動バックアップ数: $AUTO_COUNT"
fi
if [ -d "$MANUAL_BACKUP_DIR" ]; then
  MANUAL_COUNT=$(ls -1 "$MANUAL_BACKUP_DIR"/*.db 2>/dev/null | wc -l)
  echo "手動バックアップ数: $MANUAL_COUNT"
fi

# ディスク使用量
TOTAL_SIZE=$(du -sh prisma/backups 2>/dev/null | cut -f1)
echo "バックアップ総容量: $TOTAL_SIZE"

echo -e "${GREEN}=== クリーンアップ完了 ===${NC}"