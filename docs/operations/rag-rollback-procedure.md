# RAG Implementation Rollback Procedure

Version: 1.0
Last Updated: 2025-10-18
Purpose: Emergency rollback guide for RAG implementation issues

---

## Overview

This document provides step-by-step procedures for rolling back the RAG (Retrieval Augmented Generation) implementation in case of critical production issues.

**When to Use This Procedure**:
- Critical bugs affecting article retrieval
- Severe performance degradation
- OpenAI API cost explosion
- Data integrity issues
- Security vulnerabilities discovered

---

## Scenario: Production Issue Requires Immediate Rollback

### Estimated Total Time: 30-40 minutes

---

## Step 1: Assess Impact (2 minutes)

Before proceeding with rollback, assess the severity:

**Checklist**:
- [ ] Check error logs in Vercel/New Relic: Any data corruption?
- [ ] Check user reports: How many users affected?
- [ ] Check costs: OpenAI billing spike in dashboard?
- [ ] Check metrics: API error rate, latency anomalies?

**Decision Matrix**:

| Issue Severity | Action |
|----------------|--------|
| **Critical** (>50% users affected, data corruption) | Immediate rollback |
| **High** (10-50% users affected, cost spike >$100/day) | Rollback within 1 hour |
| **Medium** (Performance degradation, <10% users) | Fix forward or scheduled rollback |
| **Low** (Minor bugs, no user impact) | Fix forward, no rollback needed |

**Decision**: Proceed with rollback if severity is Critical or High

---

## Step 2: Disable RAG API (2 minutes)

Immediately stop new RAG search requests to prevent further issues.

### Option A: Environment Variable (Fastest - Recommended)

```bash
# 1. Go to Vercel Dashboard
# 2. Project Settings → Environment Variables
# 3. Add new variable:
RAG_ENABLED=false

# 4. Trigger redeploy (automatic or manual)
#    Vercel will redeploy within 1-2 minutes
```

### Option B: Code Change (If Option A unavailable)

**File**: `app/api/rag/search/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // Emergency disable
  return NextResponse.json(
    { error: 'Service temporarily unavailable for maintenance' },
    { status: 503 }
  );
}
```

```bash
# Commit and push
git add app/api/rag/search/route.ts
git commit -m "feat: emergency disable RAG API"
git push origin main

# Vercel auto-deploys
```

**Verification**:
```bash
# Test that API returns 503
curl -X POST https://techtrend.example.com/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: HTTP Status: 503
```

---

## Step 3: Create Neon Snapshot (5 minutes)

Create a backup before database changes.

**Procedure**:
1. Open Neon Dashboard: https://console.neon.tech
2. Select your project
3. Navigate to **Backups** tab
4. Click **Create Manual Snapshot**
5. Name: `Before RAG rollback - YYYY-MM-DD HH:MM`
6. Click **Create**
7. Wait for completion (usually 1-2 minutes)
8. **Download snapshot metadata** (optional, for records)

**Verification**:
- Snapshot appears in backup list with "Success" status
- Note the snapshot ID for future reference

---

## Step 4: Execute Database Rollback (10 minutes)

Remove ArticleEmbedding and ArticleChunk tables.

### Connect to Neon

1. Neon Dashboard → SQL Editor
2. Or use psql:
```bash
psql "postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
```

### Execute Rollback SQL

```sql
-- ============================================================================
-- RAG Implementation Rollback
-- WARNING: This will delete all article embeddings
-- ============================================================================

-- Step 1: Verify tables exist
\dt "Article*"

-- Expected output: Article, ArticleEmbedding, ArticleChunk

-- Step 2: Check row counts before deletion (for records)
SELECT 'ArticleEmbedding' as table_name, COUNT(*) as row_count
FROM "ArticleEmbedding"
UNION ALL
SELECT 'ArticleChunk', COUNT(*)
FROM "ArticleChunk";

-- Step 3: Drop embedding tables (CASCADE handles foreign keys)
DROP TABLE IF EXISTS "ArticleChunk" CASCADE;
DROP TABLE IF EXISTS "ArticleEmbedding" CASCADE;

-- Step 4: Verify Article table is intact
SELECT COUNT(*) as article_count FROM "Article";
SELECT COUNT(*) as source_count FROM "Source";
SELECT COUNT(*) as tag_count FROM "Tag";

-- All counts should be unchanged

-- Step 5: Verify tables are dropped
\dt "Article*"

-- Expected output: Only "Article" (no ArticleEmbedding, ArticleChunk)

-- ============================================================================
-- IMPORTANT: Do NOT drop pgvector extension
-- It may be used by other features in the future
-- ============================================================================

-- DO NOT RUN THIS:
-- DROP EXTENSION IF EXISTS vector;
```

**Verification**:
```sql
-- Verify Article table structure is unchanged
\d "Article"

-- Should show original columns only (no embedding columns)
```

---

## Step 5: Code Rollback (10 minutes)

Revert code changes to remove RAG implementation.

### Find Rollback Point

```bash
# View commit history
git log --oneline --graph | head -20

# Find last commit before RAG implementation
git log --oneline | grep -v -i "rag\|embed\|vector\|mastra"

# Example output:
# abc123 feat: improve article quality scoring
# def456 fix: cache invalidation bug
```

### Option A: Revert Specific Commits

```bash
# Identify RAG-related commits
git log --oneline --grep="RAG\|rag\|embed\|mastra" | head -10

# Revert each commit (in reverse order)
git revert <commit-sha-1>
git revert <commit-sha-2>
# ...

# Push to main
git push origin main
```

### Option B: Reset to Safe Commit (More Aggressive)

```bash
# Reset to commit before RAG implementation
git reset --hard <safe-commit-sha>

# Force push (use with EXTREME caution)
git push --force origin main

# WARNING: This will lose all commits after <safe-commit-sha>
# Only use if Option A is not feasible
```

### Remove Dependencies

```bash
# Uninstall RAG-related packages
npm uninstall @mastra/core @mastra/pg @ai-sdk/openai ai p-limit

# Commit package.json changes
git add package.json package-lock.json
git commit -m "chore: remove RAG dependencies"
git push origin main
```

**Verification**:
```bash
# Check Vercel deployment status
vercel ls

# Wait for deployment to complete
# Check deployment logs for errors
```

---

## Step 6: Verification (10 minutes)

Confirm that rollback was successful and application is stable.

### Application Verification

- [ ] **Vercel Deployment**: Check status is "Ready"
- [ ] **Homepage**: Load https://techtrend.example.com/
- [ ] **Article List**: Verify articles display correctly
- [ ] **Article Detail**: Open individual article page
- [ ] **Search**: Test existing search (FTS5) still works
- [ ] **Performance**: Check response times are normal

### Database Verification

```sql
-- Connect to Neon
psql "postgresql://..."

-- Verify tables
\dt

-- Should NOT include: ArticleEmbedding, ArticleChunk
-- Should include: Article, Source, Tag, User, etc.

-- Check article count
SELECT COUNT(*) FROM "Article";

-- Should match pre-rollback count
```

### Prisma Studio Verification

- [ ] Open Prisma Studio
- [ ] Navigate to Article model
- [ ] Verify table displays without errors
- [ ] Check sample articles have all expected fields

### Log Verification

```bash
# Check Vercel logs for RAG-related errors
# Should see no references to ArticleEmbedding or vector searches

# Check for errors in production logs
# Look for: "table does not exist", "column not found", etc.
```

---

## Step 7: Post-Mortem (1-2 hours)

Document the incident and prevent recurrence.

### Post-Mortem Template

**File**: `.claude/docs/incidents/rag-rollback-YYYY-MM-DD.md`

```markdown
# RAG Rollback Post-Mortem

Date: YYYY-MM-DD
Incident Duration: X hours
Rollback Duration: 30-40 minutes

## Summary

Brief description of the issue that required rollback.

## Timeline

- HH:MM - Issue detected
- HH:MM - Decision to rollback
- HH:MM - RAG API disabled
- HH:MM - Database rollback completed
- HH:MM - Code rollback completed
- HH:MM - Verification completed
- HH:MM - Service fully restored

## Root Cause

Detailed analysis of what went wrong.

## Impact

- Users affected: X
- Downtime: X minutes
- Data loss: None (or specify)
- Cost impact: $X

## What Went Well

- Quick detection
- Clean rollback procedure
- No data loss

## What Could Be Improved

- Better testing before deployment
- More comprehensive monitoring
- Faster rollback execution

## Action Items

- [ ] Fix root cause
- [ ] Add test coverage for failure scenario
- [ ] Update deployment checklist
- [ ] Schedule retry (if applicable)

## Follow-up

Target date for retry: YYYY-MM-DD
Responsible: [Team Member]
```

---

## Prevention Measures

### Before Future Deployments

- [ ] **Staging Environment**: Test in production-like environment first
- [ ] **Canary Deployment**: Roll out to 5% of users initially
- [ ] **Monitoring**: Set up alerts before deployment
  - OpenAI API cost spike (>$10/day)
  - Error rate (>1%)
  - Latency (p95 >500ms)
- [ ] **Rollback Plan**: Review this document before deployment
- [ ] **Communication**: Notify team of deployment window

### Monitoring Checklist

- [ ] Set up Vercel deployment notifications (Slack)
- [ ] Configure New Relic alerts
- [ ] Monitor OpenAI usage dashboard
- [ ] Check Neon database metrics

---

## Rollback Testing

### Dry Run (Recommended)

Periodically test this rollback procedure in staging:

```bash
# 1. Create test Neon branch
neon branches create --name rollback-test-YYYY-MM-DD

# 2. Deploy RAG to test branch

# 3. Execute rollback procedure

# 4. Verify application works

# 5. Delete test branch
neon branches delete rollback-test-YYYY-MM-DD
```

---

## Emergency Contacts

### Escalation Path

1. **Level 1**: On-call engineer (immediate response)
2. **Level 2**: Tech lead (within 30 minutes)
3. **Level 3**: CTO (for major incidents)

### External Support

- **Neon Support**: support@neon.tech (for database issues)
- **Vercel Support**: support@vercel.com (for deployment issues)
- **OpenAI Support**: support@openai.com (for API issues)

---

## Appendix: Common Issues

### Issue: "Table ArticleEmbedding does not exist"

**Cause**: Database rollback completed but code still references table
**Solution**: Complete Step 5 (Code Rollback)

### Issue: Prisma Studio errors on Article table

**Cause**: Incomplete rollback, vector columns still present
**Solution**: Re-run Step 4 database rollback SQL

### Issue: High OpenAI costs after rollback

**Cause**: Background embedding jobs still running
**Solution**: Disable GitHub Actions scheduled workflows

```bash
# Disable embedding cron job
# .github/workflows/rag-embed-daily.yml
# Set: if: false
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-18 | Initial rollback procedure |

---

## Related Documents

- Implementation Plan: `.claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md`
- API Specification: `docs/api/rag-search-api.md`
- Embedding Lifecycle: `docs/operations/rag-embedding-lifecycle.md`
