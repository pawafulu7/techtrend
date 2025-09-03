#!/bin/bash

# Production Migration Deployment Script
# Usage: npm run migrate:production
# Requires: PRODUCTION_DATABASE_URL environment variable

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

# Check if PRODUCTION_DATABASE_URL is set
if [ -z "$PRODUCTION_DATABASE_URL" ]; then
    echo -e "${RED}Error: PRODUCTION_DATABASE_URL environment variable is not set${NC}"
    echo
    echo "Please set it using one of these methods:"
    echo "1. Export it: export PRODUCTION_DATABASE_URL='your-database-url'"
    echo "2. Create .env.production file with PRODUCTION_DATABASE_URL"
    echo "3. Pass it directly: PRODUCTION_DATABASE_URL='url' npm run migrate:production"
    exit 1
fi

# Function to check migration status
check_status() {
    echo -e "${YELLOW}Checking migration status...${NC}"
    DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate status
    return $?
}

# Function to count pending migrations
count_pending() {
    local output=$(DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate status 2>&1)
    local pending=$(echo "$output" | grep -c "Following migrations have not yet been applied")
    if [ $pending -gt 0 ]; then
        echo "$output" | grep -A 100 "Following migrations have not yet been applied" | grep -E "^[0-9]" | wc -l
    else
        echo "0"
    fi
}

# Initial status check
echo -e "${BLUE}Step 1: Current Migration Status${NC}"
echo "================================"
check_status
STATUS_CODE=$?

# Check if there are pending migrations
PENDING_COUNT=$(count_pending)

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

DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate deploy
DEPLOY_RESULT=$?

if [ $DEPLOY_RESULT -eq 0 ]; then
    echo
    echo -e "${GREEN}✅ Migrations deployed successfully!${NC}"
    
    # Final status check
    echo
    echo -e "${BLUE}Step 3: Final Verification${NC}"
    echo "=========================="
    check_status
    
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Deployment completed successfully!   ${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    # Recommendations
    echo
    echo -e "${BLUE}Recommended next steps:${NC}"
    echo "  1. Check application health: curl your-app-url/api/health"
    echo "  2. Monitor error logs: pm2 logs"
    echo "  3. Verify functionality in production"
    echo "  4. Document this deployment in your changelog"
    
else
    echo
    echo -e "${RED}❌ Migration deployment failed!${NC}"
    echo
    echo -e "${YELLOW}Troubleshooting steps:${NC}"
    echo "  1. Check the error message above"
    echo "  2. Verify database connectivity"
    echo "  3. Check if migrations are already partially applied"
    echo "  4. Consider using: npx prisma migrate resolve --applied [migration-name]"
    echo "  5. Contact your database administrator if needed"
    echo
    echo -e "${RED}IMPORTANT: Database may be in an inconsistent state${NC}"
    exit 1
fi