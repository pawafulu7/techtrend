#!/bin/bash
# TechTrend バックアップスクリプト
# 作成日: 2025/08/01
# 目的: データベースと重要な設定ファイルの安全なバックアップ

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"

# 色付きメッセージ出力用
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== TechTrend バックアップ開始 ===${NC}"
echo "タイムスタンプ: $TIMESTAMP"

# バックアップディレクトリの作成
mkdir -p $BACKUP_DIR
echo -e "${GREEN}✓ バックアップディレクトリを確認${NC}"

# データベースのバックアップ
if [ -f "prisma/dev.db" ]; then
  cp prisma/dev.db $BACKUP_DIR/dev.db.backup_$TIMESTAMP
  echo -e "${GREEN}✓ データベースをバックアップ: $BACKUP_DIR/dev.db.backup_$TIMESTAMP${NC}"
else
  echo -e "${YELLOW}⚠ データベースファイルが見つかりません${NC}"
fi

# 環境ファイルのバックアップ
if [ -f ".env.local" ]; then
  cp .env.local $BACKUP_DIR/.env.local.backup_$TIMESTAMP
  echo -e "${GREEN}✓ 環境ファイルをバックアップ${NC}"
else
  echo -e "${YELLOW}⚠ .env.localファイルが見つかりません${NC}"
fi

# スキーマのバックアップ
if [ -f "prisma/schema.prisma" ]; then
  cp prisma/schema.prisma $BACKUP_DIR/schema.prisma.backup_$TIMESTAMP
  echo -e "${GREEN}✓ Prismaスキーマをバックアップ${NC}"
else
  echo -e "${YELLOW}⚠ schema.prismaファイルが見つかりません${NC}"
fi

# package.jsonのバックアップ
if [ -f "package.json" ]; then
  cp package.json $BACKUP_DIR/package.json.backup_$TIMESTAMP
  echo -e "${GREEN}✓ package.jsonをバックアップ${NC}"
fi

# next.config.tsのバックアップ
if [ -f "next.config.ts" ]; then
  cp next.config.ts $BACKUP_DIR/next.config.ts.backup_$TIMESTAMP
  echo -e "${GREEN}✓ next.config.tsをバックアップ${NC}"
fi

echo -e "${GREEN}=== バックアップ完了 ===${NC}"
echo "バックアップ先: $BACKUP_DIR/"

# 最新5件のバックアップを表示
echo -e "\n${GREEN}最新のバックアップ（5件）:${NC}"
ls -lt $BACKUP_DIR/dev.db.backup_* 2>/dev/null | head -5 | awk '{print "  " $9}'

# バックアップサイズの確認
BACKUP_SIZE=$(du -sh $BACKUP_DIR 2>/dev/null | cut -f1)
echo -e "\n${GREEN}バックアップフォルダのサイズ: $BACKUP_SIZE${NC}"