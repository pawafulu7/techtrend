#!/bin/bash

# Production Migration Deployment Script
# Usage: npm run migrate:production
# Requires: PROD_DATABASE_URL (environment variable, .env.local or .env)

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   TechTrend Production Migration Tool  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Load PROD_DATABASE_URL (environment variable > .env.local > .env)
# shellcheck source=scripts/db/prod-db-env.sh
source "$(dirname "$0")/../db/prod-db-env.sh"
load_prod_database_url || exit 1

# prisma migrate status / deploy の生の出力には接続先が入るため、prod_db_run で
# 決まった形の行（マイグレーション名・定型文）と成否だけを表示する
check_status() {
    echo -e "${YELLOW}Checking migration status...${NC}"
    DATABASE_URL="$PROD_DATABASE_URL" prod_db_run npx prisma migrate status
}

# 直前の migrate status の生の出力から、未適用のマイグレーションの数を出す（表示はしない）。
# 状態が読めなかった（接続できない・失敗したマイグレーションがある・未適用の見出しの後に名前を読めない）
# ときは何も出さない
count_pending() {
    local log="$1"
    if grep -qx 'Database schema is up to date!' "$log"; then
        echo "0"
    elif grep -qE '^Following migrations? have not yet been applied:$' "$log"; then
        awk '/^Following migrations? have not yet been applied:$/ { listing = 1; next }
             listing && /^[[:space:]]*[0-9]{8}[0-9]*_[A-Za-z0-9_]+[[:space:]]*$/ { n++ }
             listing && /^$/ && n > 0 { listing = 0 }
             END { if (n > 0) print n }' "$log"
    fi
}

# Initial status check
echo -e "${BLUE}Step 1: Current Migration Status${NC}"
echo "================================"
check_status || true

# Check if there are pending migrations
PENDING_COUNT=$(count_pending "$PROD_DB_LAST_LOG")

if [ -z "$PENDING_COUNT" ]; then
    echo
    echo -e "${RED}❌ Could not read the migration status.${NC}"
    echo "Check the raw output (not shown here because it contains the connection target): ${PROD_DB_LAST_LOG}"
    exit 1
fi

if [ "$PENDING_COUNT" -eq "0" ]; then
    echo
    echo -e "${GREEN}✅ Database is already up to date!${NC}"
    echo "No migrations to apply."
    exit 0
fi

# Show pending migrations count
echo
echo -e "${YELLOW}⚠️  Found $PENDING_COUNT pending migration(s)${NC}"
echo

# Safety confirmation
echo -e "${RED}WARNING: You are about to apply migrations to PRODUCTION database${NC}"
echo "This action cannot be easily undone."
echo
echo -e "${YELLOW}Have you:${NC}"
echo "  1. ✓ Backed up the production database?"
echo "  2. ✓ Tested these migrations in development?"
echo "  3. ✓ Reviewed the migration files?"
echo "  4. ✓ Notified the team about maintenance?"
echo

read -p "Do you want to proceed with deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}Deployment cancelled by user${NC}"
    exit 1
fi

# Apply migrations
echo
echo -e "${BLUE}Step 2: Applying Migrations${NC}"
echo "============================"
echo -e "${YELLOW}Executing: npx prisma migrate deploy${NC}"
echo

DEPLOY_RESULT=0
DATABASE_URL="$PROD_DATABASE_URL" prod_db_run npx prisma migrate deploy || DEPLOY_RESULT=$?
DEPLOY_LOG="$PROD_DB_LAST_LOG"

if [ $DEPLOY_RESULT -eq 0 ]; then
    echo
    echo -e "${GREEN}✅ Migrations deployed successfully!${NC}"
    
    # Final status check
    echo
    echo -e "${BLUE}Step 3: Final Verification${NC}"
    echo "=========================="
    check_status || true
    
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Deployment completed successfully!   ${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    # Recommendations
    echo
    echo -e "${BLUE}Recommended next steps:${NC}"
    echo "  1. Check application health: curl your-app-url/api/health"
    echo "  2. Monitor error logs: vercel logs --environment production"
    echo "  3. Verify functionality in production"
    echo "  4. Document this deployment in your changelog"
    
else
    echo
    echo -e "${RED}❌ Migration deployment failed!${NC}"
    echo
    echo -e "${YELLOW}Troubleshooting steps:${NC}"
    echo "  1. Check the raw output (not shown here because it contains the connection target): ${DEPLOY_LOG}"
    echo "  2. Verify database connectivity"
    echo "  3. Check if migrations are already partially applied"
    echo "  4. Consider using: npx prisma migrate resolve --applied [migration-name]"
    echo "  5. Contact your database administrator if needed"
    echo
    echo -e "${RED}IMPORTANT: Database may be in an inconsistent state${NC}"
    exit 1
fi