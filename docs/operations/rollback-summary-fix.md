# Rollback Procedure: Summary Prompt Contamination Fix

## Overview

This document describes the rollback procedure for reverting the summary prompt contamination fix if issues arise.

**Target**: Revert changes made in feature/fix-summary-prompt-contamination branch
**Estimated RTO**: 9 hours (Detection: 6h, Decision: 1h, Execution: 2h)

## Rollback Conditions

Execute rollback if ANY of the following occurs:

1. Average quality score drops below 60
2. Prompt contamination rate exceeds 1%
3. API response time exceeds 250ms consistently
4. Critical bugs discovered in production

## Prerequisites

Before starting rollback:

1. Confirm rollback decision with team lead
2. Notify all stakeholders
3. Prepare maintenance window (estimated 2 hours)
4. Ensure backup files are accessible

## Backup Files

Located in `backups/` directory:

- `article-table-full-20251007.sql` - Full Article table backup (217MB)
- `manifest-2025-10-06.json` - Contaminated article manifest (16 articles)

## Rollback Steps

### Step 1: Disable New Prompt Builder

**File**: `lib/ai/adapter/prompt-builder.ts`

```bash
# Checkout the file from main branch
git checkout main -- lib/ai/adapter/prompt-builder.ts
git checkout main -- lib/utils/article-type-prompts.ts
git checkout main -- lib/ai/constants.ts
git checkout main -- lib/ai/adapter/gemini-summary-adapter.ts
```

**Verification**:
```bash
git diff main -- lib/ai/
```

Should show no differences for AI-related files.

### Step 2: Restore Database from Backup

#### Option A: Restore Full Article Table

**WARNING**: This will overwrite ALL articles. Use only if necessary.

```bash
# Stop the application
docker-compose stop app

# Restore from backup
docker exec -i techtrend-postgres psql -U postgres techtrend_dev < backups/article-table-full-20251007.sql

# Verify restoration
docker exec techtrend-postgres psql -U postgres techtrend_dev -c "SELECT COUNT(*) FROM \"Article\";"
```

Expected count: 9169 articles

#### Option B: Selective Restore (Recommended)

Restore only the 16 contaminated articles using the manifest.

```bash
# Create selective restore script
npx tsx scripts/maintenance/selective-restore.ts --manifest=backups/manifest-2025-10-06.json
```

**Selective Restore Script** (`scripts/maintenance/selective-restore.ts`):

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function selectiveRestore(manifestPath: string) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  console.log(`Restoring ${manifest.contaminatedArticles} articles...`);

  for (const article of manifest.contaminatedArticleIds) {
    await prisma.article.update({
      where: { id: article.id },
      data: {
        summary: '',
        summaryComputedAt: null,
      },
    });
    console.log(`Reset: ${article.id}`);
  }

  console.log('Selective restore complete');
  await prisma.$disconnect();
}

const manifestPath = process.argv[2] || 'backups/manifest-2025-10-06.json';
selectiveRestore(manifestPath);
```

### Step 3: Verify Rollback

Run the following verification queries:

```bash
# Check total article count
docker exec techtrend-postgres psql -U postgres techtrend_dev -c "SELECT COUNT(*) FROM \"Article\";"

# Check contaminated articles count (should be 0 or original 16)
docker exec techtrend-postgres psql -U postgres techtrend_dev -c "
SELECT COUNT(*) FROM \"Article\"
WHERE summary LIKE '%【条件】%'
   OR summary LIKE '%【書き方】%';
"

# Check summary quality scores
docker exec techtrend-postgres psql -U postgres techtrend_dev -c "
SELECT AVG(\"qualityScore\") as avg_score
FROM \"Article\"
WHERE \"qualityScore\" IS NOT NULL;
"
```

### Step 4: Restart Application

```bash
# Rebuild the application
npm run docker:build

# Restart services
docker-compose up -d

# Verify application is running
curl http://localhost:3000/api/health
```

### Step 5: Switch Back to Old Generation Path

If the new prompt builder is causing issues, temporarily disable it:

**File**: `lib/di/bootstrap.ts`

```typescript
// Comment out the new prompt builder
// import { PromptBuilder } from '@/lib/ai/adapter/prompt-builder';

// Use the old prompt generation method
// (Implement fallback logic here)
```

### Step 6: Monitoring Post-Rollback

Monitor the following for 24 hours:

1. **Prompt contamination rate**: Should be stable
   ```bash
   npx tsx scripts/monitoring/check-summary-quality.ts
   ```

2. **API response time**: Should be < 200ms
   ```bash
   # Check application logs
   docker logs techtrend-app | grep "API response time"
   ```

3. **Quality scores**: Should stabilize around 70+
   ```sql
   SELECT AVG("qualityScore") FROM "Article" WHERE "qualityScore" IS NOT NULL;
   ```

4. **Error rate**: Should be < 5%
   ```bash
   # Check error logs
   docker logs techtrend-app | grep "ERROR" | wc -l
   ```

## Post-Rollback Actions

1. **Root Cause Analysis**
   - Investigate what went wrong
   - Document findings in `.claude/docs/postmortem/`

2. **Plan Revision**
   - Update implementation plan based on findings
   - Schedule re-implementation with improvements

3. **Stakeholder Communication**
   - Notify team of rollback completion
   - Share timeline for re-implementation

## Verification Checklist

- [ ] All AI-related files reverted to main branch
- [ ] Database restored (full or selective)
- [ ] Article count verified (9169 total)
- [ ] Application rebuilt and restarted
- [ ] Health check passing
- [ ] Monitoring dashboards checked
- [ ] No error spikes in logs
- [ ] Quality scores stable
- [ ] API response times normal

## Emergency Contacts

- **Tech Lead**: [Name]
- **Database Admin**: [Name]
- **On-Call Engineer**: [Name]

## Rollback Log Template

```markdown
## Rollback Execution Log

**Date**: YYYY-MM-DD HH:MM
**Executed By**: [Name]
**Reason**: [Brief description]

### Steps Executed:
1. [ ] Step 1: Disable new prompt builder
2. [ ] Step 2: Restore database
3. [ ] Step 3: Verify rollback
4. [ ] Step 4: Restart application
5. [ ] Step 5: Switch to old generation path
6. [ ] Step 6: Monitor for 24 hours

### Outcome:
- Article count: [X]
- Contaminated articles: [X]
- Average quality score: [X]
- API response time: [X]ms

### Issues Encountered:
[List any issues]

### Follow-up Actions:
[List follow-up tasks]
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-07
**Next Review**: Before production deployment
