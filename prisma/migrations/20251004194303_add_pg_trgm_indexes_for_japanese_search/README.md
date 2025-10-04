# Migration: Add pg_trgm Indexes for Japanese Search

## Overview

This migration adds trigram (pg_trgm) indexes to the Article table for optimizing LIKE/ILIKE search performance, supporting both Japanese and English keywords.

## Indexes Created

- `idx_article_title_trgm`: GIN index on Article.title
- `idx_article_summary_trgm`: GIN index on Article.summary

## Expected Performance Improvement

- Search time: 60s -> 2-10ms (99.9% improvement)
- Supports: Japanese, English, and mixed keywords

---

## Deployment Instructions

### Development Environment

Already applied. No action needed.

### Production Environment

**IMPORTANT**: This migration uses `CREATE INDEX CONCURRENTLY` which requires running outside of a transaction block.

#### Step 1: Set Environment Variable

```bash
export PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS=1
```

This tells Prisma to skip wrapping the migration in a transaction, allowing CONCURRENTLY to work.

#### Step 2: Run This Migration ONLY

```bash
# Deploy ONLY this migration (do not run with other pending migrations)
npx prisma migrate deploy
```

**Critical**: Ensure no other pending migrations exist. Run this migration alone.

#### Step 3: Verify Index Creation

```bash
# Check if indexes were created
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Article' AND indexname LIKE '%trgm%'"
```

Expected output:
```
idx_article_title_trgm
idx_article_summary_trgm
```

#### Step 4: Clear Environment Variable

```bash
unset PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS
```

Restore Prisma's default transactional behavior for future migrations.

---

## Alternative: Manual Script Approach

If the environment variable approach is not feasible, use a manual script:

### Step 1: Create Index Script

```bash
# Run this BEFORE prisma migrate deploy
psql $DATABASE_URL -v ON_ERROR_STOP=1 <<EOF
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_title_trgm
  ON "Article" USING gin(title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_summary_trgm
  ON "Article" USING gin(summary gin_trgm_ops);
EOF
```

### Step 2: Mark Migration as Applied

```bash
npx prisma migrate resolve --applied "20251004194303_add_pg_trgm_indexes_for_japanese_search"
```

---

## Rollback Plan

If index creation fails or causes issues:

```bash
# Drop indexes
psql $DATABASE_URL -c "DROP INDEX IF EXISTS idx_article_title_trgm"
psql $DATABASE_URL -c "DROP INDEX IF EXISTS idx_article_summary_trgm"

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back "20251004194303_add_pg_trgm_indexes_for_japanese_search"
```

---

## Monitoring

After deployment, monitor:

- Index creation progress (for CONCURRENTLY)
- Query performance
- Table lock duration (should be minimal with CONCURRENTLY)
- Application error rate

---

## Technical Details

### Why CONCURRENTLY?

- **Without CONCURRENTLY**: ACCESS EXCLUSIVE lock blocks all reads/writes during index creation
- **With CONCURRENTLY**: Allows concurrent reads/writes, minimal disruption
- **Duration**: 1-2 minutes for 8,000 records

### Why SKIP_TRANSACTIONS?

- Prisma wraps migrations in transactions by default
- `CREATE INDEX CONCURRENTLY` cannot run in a transaction
- Setting `PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS=1` disables transaction wrapping

---

## Related

- CodeRabbit Review: Major issue - production lock prevention
- CodexMCP Recommendation: Use PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS=1
- Issue: https://github.com/prisma/prisma/issues/...
