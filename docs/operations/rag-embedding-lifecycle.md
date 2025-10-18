# RAG Embedding Lifecycle Management

Version: 1.0
Last Updated: 2025-10-18
Purpose: Operational guide for managing article embeddings

---

## Overview

This document describes how to manage vector embeddings throughout their lifecycle, from initial creation to updates and version upgrades.

**Key Concepts**:
- **Embedding**: Vector representation of text (1536 dimensions)
- **embeddingKey**: Field type ("title", "summary", "content")
- **model**: Embedding model ("text-embedding-3-small", etc.)
- **version**: Embedding version for A/B testing and upgrades

---

## Embedding Lifecycle Scenarios

### Scenario 1: New Articles (Continuous Operation)

**Trigger**: Hourly RSS collection + summary generation

**Frequency**: Hourly (via GitHub Actions scheduled workflow)

**Strategy**:
- Check for articles without embeddings for active model/version
- Embed with current `RAG_ACTIVE_MODEL` and `RAG_ACTIVE_VERSION`
- Idempotent (ON CONFLICT DO UPDATE)

#### Implementation

**GitHub Actions Workflow**: `.github/workflows/rag-embed-hourly.yml`

```yaml
name: RAG Hourly Embedding

on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Manual trigger

jobs:
  embed-new-articles:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Embed new articles
        run: npx tsx scripts/rag/embed-new-articles.ts
        env:
          DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          RAG_ACTIVE_MODEL: text-embedding-3-small
          RAG_ACTIVE_VERSION: 1

      - name: Report results
        if: always()
        run: cat logs/embedding-results.json
```

**Script**: `scripts/rag/embed-new-articles.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { ArticleEmbeddingPipeline } from '@/lib/rag/article-embedding-pipeline';

const prisma = new PrismaClient();

async function main() {
  const pipeline = new ArticleEmbeddingPipeline(prisma);

  console.log('Checking for new articles to embed...');

  // Embed articles without embeddings (limit: 100 per run)
  const results = await pipeline.embedArticlesWithoutEmbeddings(100);

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log(`Embedding completed:`);
  console.log(`- Success: ${successCount}`);
  console.log(`- Failure: ${failureCount}`);

  // Save results to log file
  await fs.writeFile(
    'logs/embedding-results.json',
    JSON.stringify({ success: successCount, failure: failureCount, results }, null, 2)
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

### Scenario 2: Article Content Updated

**Trigger**: Summary regeneration (quality improvement)

**Frequency**: On-demand or daily quality checks

**Strategy**:
- Mark embedding as stale when summary changes
- Next scheduled embedding run will re-embed
- Keep same version (content update, not model change)

#### Implementation

**Update Summary Service**: `lib/ai/service/unified-summary-service.ts`

```typescript
export class UnifiedSummaryService {
  async generateSummary(article: Article): Promise<Summary> {
    // ... existing summary generation

    // After summary update, mark embedding as stale
    await this.invalidateEmbedding(article.id);

    return summary;
  }

  private async invalidateEmbedding(articleId: string): Promise<void> {
    // Delete existing embeddings to trigger re-embedding
    await this.prisma.$executeRaw`
      DELETE FROM "ArticleEmbedding"
      WHERE "articleId" = ${articleId}
    `;

    this.logger.info('Embedding invalidated for article', { articleId });
  }
}
```

**Alternative (Soft Delete)**:

Add `isStale` column to ArticleEmbedding:

```prisma
model ArticleEmbedding {
  // ... existing fields
  isStale  Boolean  @default(false)
}
```

```typescript
// Mark as stale instead of deleting
await this.prisma.$executeRaw`
  UPDATE "ArticleEmbedding"
  SET "isStale" = true
  WHERE "articleId" = ${articleId}
`;

// Embedding pipeline skips non-stale embeddings
WHERE (e."isStale" = true OR e.id IS NULL)
```

---

### Scenario 3: Embedding Model Upgrade (v1 → v2)

**Example**: Switching from `text-embedding-3-small` to `text-embedding-3-large`

**Objective**: Zero-downtime migration with A/B testing

#### Phase A: Parallel Embedding (No Downtime)

**Duration**: 1-2 days (for 10,000 articles)

```bash
# Step 1: Update environment variables (add v2, keep v1)
# Vercel Dashboard → Environment Variables
RAG_ACTIVE_MODEL=text-embedding-3-large  # New model
RAG_ACTIVE_VERSION=2                     # New version

# Step 2: Run backfill for v2 embeddings
# This runs in parallel to v1, no service interruption
npx tsx scripts/rag/embed-all-articles.ts --version=2 --model=text-embedding-3-large

# Monitor progress
tail -f logs/embedding-backfill.log

# Expected output:
# Batch 1/100
# Batch completed: 98/100 successful
# Total progress: 98/10000 (1.0%)
# ...
# Backfill completed: 9,850/10,000 articles embedded
```

**Database State**:
```sql
-- Both v1 and v2 embeddings coexist
SELECT model, version, COUNT(*) as count
FROM "ArticleEmbedding"
GROUP BY model, version;

-- Expected output:
-- text-embedding-3-small | 1 | 10000
-- text-embedding-3-large | 2 | 9850
```

#### Phase B: A/B Testing (Optional, 7-14 days)

Compare v1 vs v2 performance and relevance.

**Implementation**: Feature flag per user

```typescript
// lib/rag/vector-search-service.ts
export class VectorSearchService {
  constructor(prisma: PrismaClient, userId?: string) {
    this.prisma = prisma;

    // Determine version based on user ID (true 50/50 split using hash)
    // Note: endsWith('0') gives ~10%, not 50%. Use stable hash for true distribution.
    const bucket = userId ? (simpleHash(userId) % 2) : 0;
    this.activeVersion = bucket === 0 ? 1 : 2;

    // Simple hash function for demo (use murmurhash or similar in production)
    function simpleHash(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    }
  }
}
```

**Metrics to Track**:
- Average similarity score (v1 vs v2)
- Click-through rate on search results
- User satisfaction (surveys)
- API latency
- Cost difference

**Decision**: After 7-14 days, choose winning version

#### Phase C: Cutover (1 hour)

Switch all users to v2.

```bash
# Step 1: Update Vercel environment variables
# RAG_ACTIVE_VERSION=2  (change from 1 to 2)

# Step 2: Redeploy (automatic via Vercel)
# All new searches will use v2

# Step 3: Monitor for issues
# Check error rates, latency, user feedback
```

**Rollback Plan** (if v2 has issues):
```bash
# Quick revert
RAG_ACTIVE_VERSION=1  # Revert to v1
# Redeploy
```

#### Phase D: Cleanup (After 30 days validation)

Delete old v1 embeddings to reclaim storage.

```sql
-- Step 1: Verify v2 is stable and performing well

-- Step 2: Count v1 embeddings to delete
SELECT COUNT(*) FROM "ArticleEmbedding"
WHERE model = 'text-embedding-3-small' AND version = 1;

-- Expected: ~10,000 rows

-- Step 3: Delete v1 embeddings
DELETE FROM "ArticleEmbedding"
WHERE model = 'text-embedding-3-small' AND version = 1;

-- Step 4: Reclaim storage space
VACUUM FULL "ArticleEmbedding";
ANALYZE "ArticleEmbedding";

-- Step 5: Verify storage reduction
SELECT pg_size_pretty(pg_total_relation_size('"ArticleEmbedding"'));

-- Expected: Reduced by ~60MB (10,000 articles × 6KB)
```

---

### Scenario 4: Embedding Version Bump (Same Model)

**Example**: Algorithm improvement, need to re-embed with same model

**Objective**: Transparent upgrade without model change

```bash
# Step 1: Bump version
export RAG_ACTIVE_VERSION=2  # Increment version

# Step 2: Re-embed all articles with new version
npx tsx scripts/rag/embed-all-articles.ts --version=2

# Step 3: Test v2 embeddings

# Step 4: Cutover immediately (or A/B test)
# Update RAG_ACTIVE_VERSION in Vercel

# Step 5: Clean up v1 after validation
DELETE FROM "ArticleEmbedding" WHERE version = 1;
```

---

## Operational Commands

### Check Embedding Status

```sql
-- Count embeddings by model and version
SELECT model, version, "embeddingKey", COUNT(*) as count
FROM "ArticleEmbedding"
GROUP BY model, version, "embeddingKey"
ORDER BY model, version, "embeddingKey";

-- Find articles without embeddings
SELECT COUNT(*) FROM "Article" a
WHERE NOT EXISTS (
  SELECT 1 FROM "ArticleEmbedding" e
  WHERE e."articleId" = a.id
  AND e.model = 'text-embedding-3-small'
  AND e.version = 1
  AND e."embeddingKey" = 'summary'
)
AND a.summary IS NOT NULL;
```

### Manual Embedding Trigger

```bash
# Embed specific article by ID
npx tsx scripts/rag/embed-article-by-id.ts --id=clh1234567890

# Embed articles by source
npx tsx scripts/rag/embed-by-source.ts --source="OpenAI Blog"

# Embed articles by date range
npx tsx scripts/rag/embed-by-date.ts --from=2025-10-01 --to=2025-10-18
```

### Monitoring Queries

```sql
-- Embedding freshness (articles embedded in last 24 hours)
SELECT COUNT(*) FROM "ArticleEmbedding"
WHERE "computedAt" > NOW() - INTERVAL '24 hours';

-- Embedding lag (articles published but not embedded)
SELECT COUNT(*) FROM "Article" a
WHERE a."publishedAt" > NOW() - INTERVAL '7 days'
AND NOT EXISTS (
  SELECT 1 FROM "ArticleEmbedding" e
  WHERE e."articleId" = a.id
  AND e.model = 'text-embedding-3-small'
  AND e.version = 1
);

-- Storage usage
SELECT pg_size_pretty(pg_total_relation_size('"ArticleEmbedding"')) as size;
```

---

## Troubleshooting

### Problem: Embeddings not being created

**Symptoms**: New articles have no embeddings after 24 hours

**Diagnosis**:
```bash
# Check scheduled workflow runs
gh run list --workflow=rag-embed-hourly.yml --limit=10

# Check workflow logs
gh run view <run-id> --log
```

**Solutions**:
1. Verify OpenAI API key is valid
2. Check OpenAI rate limits not exceeded
3. Verify DATABASE_URL is correct
4. Check workflow is not disabled

### Problem: High embedding costs

**Symptoms**: OpenAI billing higher than expected

**Diagnosis**:
```sql
-- Count embeddings created today
SELECT COUNT(*) FROM "ArticleEmbedding"
WHERE "computedAt" > CURRENT_DATE;

-- Expected: ~100 (for hourly new articles)
-- If > 1000: Investigate why so many embeddings created
```

**Solutions**:
1. Check for duplicate embedding runs
2. Verify idempotency (ON CONFLICT DO UPDATE)
3. Review backfill scripts for infinite loops
4. Set OpenAI budget alerts

### Problem: Stale embeddings (old content)

**Symptoms**: Search results don't reflect updated summaries

**Diagnosis**:
```sql
-- Find articles with outdated embeddings
SELECT a.id, a.title,
       a."updatedAt" as article_updated,
       e."computedAt" as embedding_computed
FROM "Article" a
JOIN "ArticleEmbedding" e ON e."articleId" = a.id
WHERE e."embeddingKey" = 'summary'
AND a."updatedAt" > e."computedAt"
LIMIT 10;
```

**Solutions**:
1. Implement embedding invalidation on summary updates
2. Run manual re-embedding for affected articles
3. Set up monitoring for embedding staleness

---

## Best Practices

### Embedding Frequency

**Recommendation**:
- **New articles**: Hourly (after RSS collection)
- **Updated articles**: On-demand (when summary changes)
- **Full re-embedding**: Only on version upgrades

### Cost Optimization

- **Cache query embeddings** (Redis, 7-day TTL)
- **Batch processing** (100 articles per run)
- **Rate limiting** (respect OpenAI limits)
- **Monitor usage** (set budget alerts)

### Quality Assurance

- **Validation**: Check embedding dimensions (1536)
- **Monitoring**: Track success/failure rates
- **Alerting**: Notify on >5% failure rate
- **Testing**: Periodically verify search relevance

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-18 | Initial lifecycle guide |

---

## Related Documents

- API Specification: `docs/api/rag-search-api.md`
- Rollback Procedure: `docs/operations/rag-rollback-procedure.md`
- Implementation Plan: `.claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md`
