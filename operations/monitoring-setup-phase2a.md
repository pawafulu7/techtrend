# Phase 2-A Monitoring Setup Guide

## Document Information

- **Version**: 1.0
- **Last Updated**: 2025-11-16
- **Owner**: Backend Team / SRE
- **Purpose**: Monitoring configuration for Phase 2-A DB-backed Source Provider

## Overview

### Monitoring Strategy

Phase 2-A introduces database-backed source provider, requiring enhanced monitoring to:
- Detect performance degradation early
- Validate SLA compliance (P95 < 200ms)
- Ensure database and cache health
- Track feature flag effectiveness

### Monitoring Tools

**Primary**: New Relic APM
- Application performance monitoring
- Database query analysis
- Custom metrics and events
- Alert routing and escalation

**Secondary**: Vercel Analytics
- Real User Monitoring (RUM)
- Speed Insights (Core Web Vitals)
- Edge function invocations

**Recommended**: Both tools in combination
- New Relic: Backend/SLO monitoring
- Vercel Analytics: Frontend/UX monitoring

## Essential Metrics

### 1. Error Rate

**Definition**: Percentage of requests resulting in errors

**Targets**:
- **First 24 hours**: < 1%
- **Normal operation**: < 2%

**Measurement**:
```sql
-- New Relic NRQL
SELECT (count(*) FILTER (WHERE error IS true) / count(*)) * 100 AS error_rate
FROM Transaction
WHERE appName = 'techtrend-web'
  AND request.uri LIKE '/api/%'
SINCE 1 hour ago
```

**Alert Configuration**:
- **Critical**: Error rate > 2% for 5 minutes continuous
- **Warning**: Error rate > 1% for 10 minutes continuous
- **Routing**: Slack #techtrend-alerts + PagerDuty (critical only)

### 2. Response Latency

**Definition**: Time to complete API requests

**Targets**:
- **P50**: < 100ms
- **P95**: < 200ms (SLA)
- **P99**: < 500ms

**Measurement**:
```sql
-- New Relic NRQL
SELECT percentile(duration, 50, 95, 99)
FROM Transaction
WHERE appName = 'techtrend-web'
  AND request.uri LIKE '/api/%'
SINCE 1 hour ago
TIMESERIES
```

**Alert Configuration**:
- **Critical**: P95 > 500ms for 10 minutes continuous
- **Warning**: P95 > 300ms for 15 minutes continuous (first 24h only)
- **Routing**: Slack #techtrend-alerts + Email on-call

### 3. Database Connection Pool

**Definition**: PostgreSQL connection pool utilization

**Targets**:
- **Normal**: < 60%
- **Warning**: 60-80%
- **Critical**: > 90%

**Measurement**:
```sql
-- New Relic NRQL (requires custom instrumentation)
SELECT average(dbConnectionPoolActive) AS active_connections,
       average(dbConnectionPoolWaiting) AS waiting_connections,
       (average(dbConnectionPoolActive) / max(dbConnectionPoolMax)) * 100 AS utilization
FROM Custom
WHERE eventType = 'DatabasePool'
SINCE 1 hour ago
TIMESERIES
```

**Note**: Requires custom instrumentation (see Prisma Instrumentation section below)

**Alert Configuration**:
- **Critical**: Utilization > 90% for 5 minutes continuous
- **Warning**: Utilization > 80% for 10 minutes continuous
- **Routing**: Slack #techtrend-alerts + PagerDuty

### 4. Prisma Query Performance

**Definition**: Database query execution time via Prisma

**Targets**:
- **P95 Query Duration**: < 50ms
- **Slow Query Count**: 0 queries > 100ms

**Measurement**:
```sql
-- New Relic NRQL (requires Prisma middleware)
SELECT percentile(duration, 95) AS p95_duration,
       count(*) FILTER (WHERE duration > 100) AS slow_query_count
FROM PrismaQuery
WHERE model = 'Source' OR model = 'SourceGroup'
SINCE 1 hour ago
FACET model
```

**Alert Configuration**:
- **Warning**: P95 query duration > 100ms for 10 minutes
- **Info**: Slow query count > 0 (for investigation, not immediate action)

### 5. Cache Performance

**Definition**: Redis cache hit rate for Phase 2-A queries

**Targets**:
- **Cache Hit Rate**: > 80%
- **Cache Miss Latency**: < 200ms

**Measurement**:
```sql
-- New Relic NRQL (requires custom instrumentation)
SELECT (count(*) FILTER (WHERE cacheHit IS true) / count(*)) * 100 AS hit_rate,
       percentile(duration FILTER (WHERE cacheHit IS false), 95) AS miss_latency
FROM CacheOperation
WHERE cacheKey LIKE 'company-sources%'
SINCE 1 hour ago
```

**Alert Configuration**:
- **Warning**: Hit rate < 70% for 15 minutes continuous
- **Info**: Hit rate < 80% (for trend monitoring)

### 6. Feature Flag Evaluation

**Definition**: Frequency of USE_DATABASE_PROVIDER flag evaluation

**Targets**:
- **Initial (24-48h)**: 100% of provider instantiations should evaluate flag
- **Steady state**: Tracking only (no threshold)

**Measurement**:
```sql
-- New Relic NRQL (requires custom logging)
SELECT count(*) AS flag_evaluations,
       count(*) FILTER (WHERE flagValue IS true) AS db_provider_count,
       (count(*) FILTER (WHERE flagValue IS true) / count(*)) * 100 AS db_provider_ratio
FROM Log
WHERE message LIKE '%USE_DATABASE_PROVIDER%'
SINCE 1 hour ago
```

**Alert Configuration**:
- **Initial phase only**: DB provider ratio < 90% (indicates flag not propagating)

## Dashboard Configuration

### Recommended Dashboard Layout

**Dashboard Name**: Phase 2-A Production Migration

#### Panel 1: Error Rate (Single Value + Threshold Band)
- **Metric**: Transaction error rate
- **Visualization**: Billboard with threshold bands (green < 1%, yellow 1-2%, red > 2%)
- **Comparison**: Previous 24 hours

#### Panel 2: Latency Distribution (Line Chart)
- **Metrics**: P50, P95, P99 latency
- **Visualization**: Multi-line time series
- **Y-axis**: 0-600ms
- **Threshold lines**: 200ms (SLA), 500ms (critical)
- **Comparison**: Previous week

#### Panel 3: Database Connection Pool (Stacked Area)
- **Metrics**: Active connections, Waiting connections, Max pool size
- **Visualization**: Stacked area chart
- **Y-axis**: 0-100 (connection count)
- **Threshold line**: 90% of max (critical threshold)

#### Panel 4: Prisma Query Performance (Histogram)
- **Metric**: Query duration distribution
- **Visualization**: Histogram with percentile overlays
- **Buckets**: 0-10ms, 10-25ms, 25-50ms, 50-100ms, 100ms+
- **Overlays**: P95, P99 lines

#### Panel 5: Cache Performance (Heatmap + Line)
- **Metrics**: Cache hit rate, Cache miss latency
- **Visualization**: Dual-axis (hit rate line + miss latency heatmap)
- **Thresholds**: Hit rate 80% (target), Miss latency 200ms (target)

#### Panel 6: Feature Flag Evaluation (Donut Chart)
- **Metric**: DB Provider vs Static Provider ratio
- **Visualization**: Donut chart or pie chart
- **Expected**: 100% DB Provider after migration
- **Use**: Initial migration verification (first 48 hours)

### New Relic Dashboard Query Examples

```sql
-- Panel 1: Error Rate with threshold
SELECT (count(*) FILTER (WHERE error IS true) / count(*)) * 100 AS error_rate
FROM Transaction
WHERE appName = 'techtrend-web'
SINCE 1 hour ago
COMPARE WITH 1 day ago
TIMESERIES 5 minutes

-- Panel 2: Latency Distribution
SELECT percentile(duration, 50) AS p50,
       percentile(duration, 95) AS p95,
       percentile(duration, 99) AS p99
FROM Transaction
WHERE appName = 'techtrend-web'
  AND request.uri LIKE '/api/%'
SINCE 1 hour ago
TIMESERIES 1 minute

-- Panel 3: DB Connection Pool (custom event)
SELECT average(active) AS active_connections,
       average(waiting) AS waiting_connections,
       max(max) AS max_pool_size
FROM DatabasePool
SINCE 1 hour ago
TIMESERIES 5 minutes

-- Panel 4: Prisma Query Performance (custom event)
SELECT histogram(duration, 100, 10) AS duration_distribution,
       percentile(duration, 95) AS p95,
       percentile(duration, 99) AS p99
FROM PrismaQuery
WHERE model IN ('Source', 'SourceGroup', 'SourceTag')
SINCE 1 hour ago

-- Panel 5: Cache Performance (custom event)
SELECT (count(*) FILTER (WHERE hit IS true) / count(*)) * 100 AS hit_rate,
       percentile(duration FILTER (WHERE hit IS false), 95) AS miss_p95
FROM CacheOperation
WHERE operation = 'getCompanySources'
SINCE 1 hour ago
TIMESERIES 5 minutes

-- Panel 6: Feature Flag Evaluation (custom log)
SELECT count(*) FILTER (WHERE provider = 'DatabaseCompanySourceProvider') AS db_provider,
       count(*) FILTER (WHERE provider = 'StaticCompanySourceProvider') AS static_provider
FROM Log
WHERE message LIKE '%CompanySourceProvider instantiated%'
SINCE 1 hour ago
```

## Alert Configuration

### Alert Policy: Phase 2-A Production Migration

#### Alert 1: High Error Rate (CRITICAL)

**Condition**:
```sql
SELECT (count(*) FILTER (WHERE error IS true) / count(*)) * 100 AS error_rate
FROM Transaction
WHERE appName = 'techtrend-web'
```

**Threshold**: error_rate > 2% for at least 5 minutes
**Routing**: PagerDuty (on-call) + Slack #techtrend-alerts
**Runbook**: operations/rollback-runbook-phase2a.md

#### Alert 2: High Latency (CRITICAL)

**Condition**:
```sql
SELECT percentile(duration, 95) AS p95_latency
FROM Transaction
WHERE appName = 'techtrend-web'
  AND request.uri LIKE '/api/%'
```

**Threshold**: p95_latency > 500ms for at least 10 minutes
**Routing**: Slack #techtrend-alerts + Email on-call
**Runbook**: operations/rollback-runbook-phase2a.md

#### Alert 3: DB Connection Pool Saturation (CRITICAL)

**Condition**:
```sql
SELECT (average(active) / max(max)) * 100 AS pool_utilization
FROM DatabasePool
```

**Threshold**: pool_utilization > 90% for at least 5 minutes
**Routing**: PagerDuty + Slack #techtrend-alerts
**Runbook**: operations/rollback-runbook-phase2a.md

#### Alert 4: Low Cache Hit Rate (WARNING)

**Condition**:
```sql
SELECT (count(*) FILTER (WHERE hit IS true) / count(*)) * 100 AS hit_rate
FROM CacheOperation
WHERE operation LIKE 'getCompanySources%'
```

**Threshold**: hit_rate < 70% for at least 15 minutes
**Routing**: Slack #techtrend-alerts (no page)
**Action**: Investigate, not immediate rollback

#### Alert 5: Feature Flag Propagation (WARNING, first 24h only)

**Condition**:
```sql
SELECT (count(*) FILTER (WHERE provider = 'DatabaseCompanySourceProvider') / count(*)) * 100 AS db_ratio
FROM Log
WHERE message LIKE '%CompanySourceProvider%'
```

**Threshold**: db_ratio < 90% for at least 10 minutes
**Routing**: Slack #techtrend-alerts
**Duration**: First 24 hours only, then disable

### Alert Threshold Adjustment Schedule

**Initial (0-24 hours)**:
- Error rate: > 1% (strict)
- P95 latency: > 300ms (strict)
- DB pool: > 80% (strict)
- Cache hit: < 70% (strict)

**Normal (after 24 hours)**:
- Error rate: > 2%
- P95 latency: > 500ms
- DB pool: > 90%
- Cache hit: < 60%

**Update alerts** at 24-hour mark based on observed baseline.

## Synthetic Monitoring

### New Relic Synthetic Check

**Purpose**: Proactive API availability monitoring

**Configuration**:
- **Check Name**: Phase 2-A API Sources Health
- **URL**: https://techtrend.vercel.app/api/sources?category=company
- **Frequency**: Every 1 minute (first 7 days), then every 5 minutes
- **Locations**: Multiple regions (US, EU, Asia)
- **Validation**:
  - HTTP status: 200
  - Response time: < 500ms
  - Response body contains: `"sources":[`
  - Source count: > 0

**Alert**:
- **Threshold**: 3 consecutive failures
- **Routing**: PagerDuty + Slack #techtrend-alerts
- **Runbook**: operations/rollback-runbook-phase2a.md

### Setup Procedure

**Via New Relic UI**:
1. Synthetics → Create monitor
2. Type: API test
3. URL: https://techtrend.vercel.app/api/sources?category=company
4. Frequency: 1 minute
5. Locations: Select 3+ regions
6. Validation: Add assertions
7. Alert: Link to Phase 2-A alert policy
8. Save

## Custom Instrumentation

### Prisma Query Instrumentation

**Purpose**: Track database query performance and retries

**Implementation** (add to `instrumentation.ts` or new `lib/telemetry/prisma-instrumentation.ts`):

```typescript
import { PrismaClient } from '@prisma/client';

export function instrumentPrisma(prisma: PrismaClient) {
  // Middleware for query duration tracking
  prisma.$use(async (params, next) => {
    const start = Date.now();
    let result;
    let error = null;

    try {
      result = await next(params);
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const duration = Date.now() - start;

      // Send custom event to New Relic (if available)
      if (typeof newrelic !== 'undefined') {
        newrelic.recordCustomEvent('PrismaQuery', {
          model: params.model,
          action: params.action,
          duration,
          error: error ? error.message : null,
        });
      }

      // Or log for New Relic Log API ingestion
      if (duration > 100) {
        console.log(JSON.stringify({
          type: 'PrismaSlowQuery',
          model: params.model,
          action: params.action,
          duration,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    return result;
  });
}

// Usage in prisma client initialization
// const prisma = new PrismaClient();
// instrumentPrisma(prisma);
```

**Metrics Captured**:
- Query duration (ms)
- Model and action (e.g., Source.findMany)
- Error messages (if any)
- Slow query identification (> 100ms)

### Cache Operation Instrumentation

**Purpose**: Track Redis cache hit rate and miss latency

**Implementation** (add to `lib/cache/source-cache.ts`):

```typescript
// In getCompanySources() method
async getCompanySources(): Promise<CompanySource[]> {
  const cacheKey = 'company-sources';
  const start = Date.now();

  try {
    const cached = await this.redis.get(cacheKey);
    const duration = Date.now() - start;

    if (cached) {
      // Cache hit
      this.recordCacheMetric(cacheKey, true, duration);
      return JSON.parse(cached);
    } else {
      // Cache miss - fetch from DB
      const sources = await this.fetchFromDatabase();
      const totalDuration = Date.now() - start;

      this.recordCacheMetric(cacheKey, false, totalDuration);
      await this.redis.set(cacheKey, JSON.stringify(sources), 'EX', 300);

      return sources;
    }
  } catch (error) {
    // Cache error - continue to database
    const duration = Date.now() - start;
    this.recordCacheMetric(cacheKey, false, duration, error);
    return this.fetchFromDatabase();
  }
}

private recordCacheMetric(key: string, hit: boolean, duration: number, error?: Error) {
  // Send to New Relic
  if (typeof newrelic !== 'undefined') {
    newrelic.recordCustomEvent('CacheOperation', {
      cacheKey: key,
      hit,
      duration,
      operation: 'get',
      error: error?.message,
    });
  }

  // Or structured log for NR Log API
  console.log(JSON.stringify({
    type: 'CacheMetric',
    key,
    hit,
    duration,
    timestamp: new Date().toISOString(),
  }));
}
```

### Database Connection Pool Instrumentation

**Purpose**: Track connection pool utilization

**Implementation** (add to Prisma client setup):

```typescript
// Monitor connection pool periodically
setInterval(() => {
  const poolMetrics = (prisma as any).$pool?.metrics;

  if (poolMetrics) {
    if (typeof newrelic !== 'undefined') {
      newrelic.recordCustomEvent('DatabasePool', {
        active: poolMetrics.active,
        waiting: poolMetrics.waiting,
        idle: poolMetrics.idle,
        max: poolMetrics.max,
        timestamp: new Date().toISOString(),
      });
    }
  }
}, 60000); // Every minute
```

**Note**: Prisma client pool API may vary; adjust based on actual Prisma version.

## New Relic Setup

### Vercel Integration (Recommended)

**Step 1: Install New Relic Integration**
1. Visit https://vercel.com/integrations/newrelic
2. Click "Add Integration"
3. Select `techtrend` project
4. Authorize New Relic access

**Step 2: Verify Environment Variables**
Environment variables are automatically set by integration:
- `NEW_RELIC_LICENSE_KEY`
- `NEW_RELIC_APP_NAME`

Verify in Vercel Dashboard → Settings → Environment Variables

**Step 3: Deploy to Activate**
```bash
# Redeploy to apply New Relic instrumentation
vercel --prod
```

**Step 4: Verify in New Relic**
1. Login to https://one.newrelic.com
2. Navigate to APM & Services
3. Find `techtrend-web` application
4. Confirm data flowing (may take 5-10 minutes)

### Dashboard Creation

**Step 1: Create Custom Dashboard**
1. New Relic → Dashboards → Create dashboard
2. Name: "Phase 2-A Production Migration"
3. Add panels (see Dashboard Configuration section above)

**Step 2: Add Alert Policies**
1. Alerts & AI → Alert conditions (classic)
2. Create policy: "Phase 2-A Migration Alerts"
3. Add conditions (see Alert Configuration section above)
4. Configure notification channels

**Step 3: Configure Notification Channels**
- Slack: #techtrend-alerts webhook
- Email: oncall@example.com
- PagerDuty: Integration key (for critical alerts)

### Synthetic Monitor Setup

1. New Relic → Synthetic monitoring → Create monitor
2. Monitor type: Endpoint availability
3. URL: https://techtrend.vercel.app/api/sources?category=company
4. Name: Phase 2-A API Health Check
5. Frequency: Every 1 minute
6. Locations: Select 3+ (e.g., US East, EU West, Asia Pacific)
7. Validation script:
   ```javascript
   assert.equal($statusCode, 200, 'Status should be 200');
   assert.ok($responseBody.includes('"sources"'), 'Response should contain sources');
   ```
8. Alert on: 3 consecutive failures
9. Notification: Slack + PagerDuty
10. Save

## Vercel Analytics Setup

### Speed Insights

**Step 1: Enable Speed Insights**
1. Vercel Dashboard → Analytics tab
2. Enable Speed Insights (if not already enabled)
3. Confirm Real User Monitoring is active

**Step 2: Monitor Core Web Vitals**
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

**Use**: Verify no UX degradation after migration

### Edge Function Invocations

**Monitor**: Vercel Dashboard → Usage
- Track invocation count trend
- Detect unexpected spikes (may indicate caching issues)

## Monitoring Workflow

### Initial Phase (0-24 hours)

**Active Monitoring**:
- **Frequency**: Every 10 minutes (first hour), then hourly
- **Responsibility**: On-call engineer + QA
- **Tools**: New Relic dashboard + Vercel Analytics
- **Action**: Log metrics, investigate anomalies immediately

**Checklist per checkpoint**:
- [ ] Check error rate
- [ ] Check P95 latency
- [ ] Check DB pool utilization
- [ ] Check cache hit rate
- [ ] Review error logs
- [ ] Test one API endpoint manually

### Normal Phase (24-48 hours)

**Reduced Active Monitoring**:
- **Frequency**: Every 3 hours
- **Responsibility**: On-call engineer
- **Tools**: Primarily alerts (passive monitoring)
- **Action**: Review trends, adjust thresholds

### Steady State (after 48 hours)

**Alert-Based Monitoring**:
- **Frequency**: Alert-driven only
- **Responsibility**: On-call rotation
- **Tools**: New Relic alerts + Vercel notifications
- **Action**: Respond to alerts, weekly metric reviews

## Additional Metrics (Optional)

### External Dependency Health

**RSS Feeds/External APIs**:
```sql
-- Track external API error rate
SELECT count(*) FILTER (WHERE error IS true) AS external_errors
FROM Transaction
WHERE request.uri LIKE '%external%'
  OR name LIKE '%Fetch%'
SINCE 1 hour ago
```

### Cost Monitoring

**Vercel Usage**:
- Monitor Edge Function invocations (Usage dashboard)
- Database read/write units trend
- Unexpected cost spikes may indicate caching failure

**Alert**: Invocation count > 120% of baseline for 1 hour

### Queue/Background Job Health (if applicable)

**If BullMQ or background jobs**:
```sql
-- Job queue depth
SELECT average(queueDepth) AS avg_depth,
       max(queueDepth) AS max_depth
FROM BackgroundJob
SINCE 1 hour ago

-- Job processing time
SELECT percentile(processingTime, 95) AS p95_time
FROM BackgroundJob
WHERE jobType = 'articleProcessing'
SINCE 1 hour ago
```

## Post-Migration Monitoring Adjustment

### After 48 Hours

**Review and Adjust**:
1. **Baseline Performance**: Calculate new baseline from 48-hour data
2. **Alert Thresholds**: Adjust to normal operating levels
   - Error rate: 1% → 2%
   - P95 latency: 300ms → 500ms (alert level, not SLA)
   - DB pool: 80% → 90%
3. **Synthetic Check**: Reduce frequency to 5 minutes
4. **Dashboard**: Archive initial migration panels, focus on operational metrics

### After 1 Week

**Stabilization**:
- Remove Phase 2-A specific alerts (keep general SLO alerts)
- Merge Phase 2-A dashboard into main operations dashboard
- Document final baseline performance
- Schedule monthly metric review

## Troubleshooting

### High Error Rate

**Investigation**:
1. Check error logs for specific error messages
2. Identify error source: Provider/Database/Cache
3. Check recent deployments or configuration changes
4. Review database query performance

**Common Causes**:
- Database connection exhaustion
- Prisma query timeout
- Cache unavailability
- Feature flag misconfiguration

**Action**: See rollback runbook if threshold exceeded

### High Latency

**Investigation**:
1. Check P95 latency breakdown: API → DB → Cache
2. Identify slow queries (Prisma slow query log)
3. Check database connection pool saturation
4. Verify cache hit rate

**Common Causes**:
- Cold cache (low hit rate)
- Database index missing or inefficient
- Connection pool exhaustion
- External API timeout

**Action**: Optimize queries, warm cache, or rollback if SLA violated

### Low Cache Hit Rate

**Investigation**:
1. Check cache TTL configuration (expected: 5 minutes)
2. Verify Redis availability
3. Check for cache key mismatch
4. Review cache eviction logs

**Common Causes**:
- Redis memory pressure (evictions)
- Cache key changes
- TTL too short
- High cache churn (constantly changing data)

**Action**: Investigate cache configuration, adjust TTL if needed

## References

- **Migration Procedure**: `operations/production-migration-phase2a.md`
- **Rollback Runbook**: `operations/rollback-runbook-phase2a.md`
- **Health Check Script**: `scripts/health-check-feature-flag.ts`
- **New Relic Documentation**: https://docs.newrelic.com/docs/apm
- **Vercel Analytics Documentation**: https://vercel.com/docs/analytics
