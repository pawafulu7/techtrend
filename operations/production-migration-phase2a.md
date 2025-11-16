# Phase 2-A Production Migration Procedure

## Document Information

- **Version**: 1.0
- **Last Updated**: 2025-11-16
- **Owner**: Backend Team
- **Purpose**: Production migration procedure for Phase 2-A DB-backed Source Provider

## Overview

### Migration Target
- Feature Flag: `USE_DATABASE_PROVIDER=true` (enable DB-backed provider)
- Scope: Switch from Static to Database Company Source Provider

### Migration Strategy
- **Method**: Feature Flag controlled gradual rollout
- **Approach**: Preview → Production
- **Rollback**: Instant (environment variable toggle)
- **Downtime**: None

### Recommended Timing
- **Day**: Tuesday (avoid Monday and Friday)
- **Time**: 09:00-18:00 (business hours, with on-call coverage)
- **Duration**: 1 hour migration + 8 hours initial monitoring + 48 hours extended monitoring

### Prerequisites

All Phase 2-A implementation completed:
- PR #208: DB Infrastructure (Merged)
- PR #209: UI Integration & Compatibility (Merged)
- PR #210: Dev Environment Verification (Merged)
- PR #211: Day 5 Integration Tests (Merged)
- PR #212: Day 6 Performance Tests (Merged)
- Day 7: E2E Regression Tests (190 tests passed with flag=true)

## Pre-Migration Preparation

### 2-3 Days Before Migration

#### Technical Readiness

- [ ] **CI Configuration Updated**: USE_DATABASE_PROVIDER=true in GitHub Actions E2E tests
- [ ] **CI E2E Tests Passing**: All tests pass with flag=true (verify in latest CI run)
- [ ] **Health Check Script Tested**: Verify script works in both flag states
- [ ] **Database Migration Verified**: SourceGroup (6 records), Source.groupId (40+ records) confirmed in production DB
- [ ] **Rollback Runbook Reviewed**: Team familiar with emergency procedures
- [ ] **Monitoring Dashboards Ready**: New Relic/Vercel Analytics accessible
- [ ] **Alert Configuration Complete**: Thresholds set, notifications configured

#### Operational Readiness

- [ ] **On-call Coverage Secured**: 48-hour coverage confirmed (names, contact info)
- [ ] **Stakeholder Approval Meeting**: Migration plan reviewed and approved
- [ ] **Deployment Freeze Announced**: No unrelated deployments during migration window
- [ ] **DB Maintenance Window Checked**: No conflicting database maintenance
- [ ] **Communication Plan Ready**: Slack channels, email templates prepared

#### Backup and Safety

- [ ] **Database Backup**: Take production DB snapshot before migration
  ```bash
  # Via Vercel Postgres CLI or provider dashboard
  # Record backup ID and timestamp
  ```
- [ ] **Environment Variable Backup**: Export current Vercel env vars
  ```bash
  vercel env pull .env.production.before-migration
  ```
- [ ] **Last Known Good Build**: Record deployment URL with USE_DATABASE_PROVIDER=false

### 1-2 Days Before Migration

#### Preview Environment Testing

**Step 1: Configure Preview Environment**
```bash
# Set environment variable in Vercel Preview
vercel env add USE_DATABASE_PROVIDER preview
# Value: true
```

**Step 2: Deploy to Preview**
```bash
# Trigger preview deployment
git push origin feature/phase2a-production-migration
# Or deploy directly
vercel --preview
```

**Step 3: Run Health Check**
```bash
# Test against Preview URL
BASE_URL=https://techtrend-preview.vercel.app npx tsx scripts/health-check-feature-flag.ts

# Expected: Feature Flag ENABLED, Status PASS
```

**Step 4: Cache Warm-up Rehearsal**
```bash
# Connect to Preview Redis (if available)
redis-cli -h <preview-redis-host> FLUSHDB

# Measure cold start latency
curl -w "@curl-format.txt" https://techtrend-preview.vercel.app/api/sources?category=company

# Record initial latency (cold cache)
# Wait 5 minutes, repeat (warm cache)
# Compare latencies
```

**Step 5: Dual Provider Smoke Test**
```bash
# Compare Static vs DB provider results
# Run with USE_DATABASE_PROVIDER=false
curl https://techtrend-preview.vercel.app/api/sources?category=company > static-result.json

# Switch to USE_DATABASE_PROVIDER=true (via Vercel env var)
curl https://techtrend-preview.vercel.app/api/sources?category=company > db-result.json

# Compare source counts, IDs, order
diff static-result.json db-result.json
```

**Step 6: Preview Monitoring (2-3 hours minimum)**
- [ ] Monitor error rate (target: 0%)
- [ ] Monitor P95 latency (target: < 200ms)
- [ ] Monitor DB connection pool (target: < 30%)
- [ ] Test all category filters (foreign, domestic, company)
- [ ] Test all presets (all, daily, weekly, interesting)
- [ ] Verify UI consistency (no visual regressions)

**Step 7: Preview Approval**
- [ ] No errors detected in 2-3 hour window
- [ ] Performance metrics meet SLA
- [ ] Functional tests pass
- [ ] Approval documented (Slack thread with timestamp)

#### Final Preparation (Day Before Migration)

- [ ] **Pre-Flight Meeting**: Review timeline, roles, rollback criteria with team
- [ ] **Notification Sent**: Stakeholders notified of migration schedule (24 hours notice)
- [ ] **Monitoring Access Verified**: All team members can access dashboards
- [ ] **Rollback Rehearsal**: Walk through rollback procedure (table-top exercise)

## Migration Day Procedure

### Timeline Overview

| Phase | Time | Duration | Activity |
|-------|------|----------|----------|
| Phase 0 | 08:30-09:00 | 30 min | Pre-flight checks |
| Phase 1 | 09:00-10:00 | 60 min | Migration execution |
| Phase 2 | 10:00-11:00 | 60 min | Initial monitoring (critical) |
| Phase 3 | 11:00-18:00 | 7 hours | Extended monitoring |
| Phase 4 | Day 1-2 | 48 hours | Continuous monitoring |

### Phase 0: Pre-Flight Checks (08:30-09:00)

**30 minutes before migration start**

- [ ] **Team Assembly**: On-call engineer, incident commander, QA available
- [ ] **System Health**: Verify all services healthy (DB, Redis, Vercel)
- [ ] **CI Status**: Latest CI build passed with USE_DATABASE_PROVIDER=true
- [ ] **Database Verification**:
  ```sql
  -- Verify production database state
  SELECT COUNT(*) FROM "SourceGroup";  -- Expected: 6
  SELECT COUNT(*) FROM "Source" WHERE "groupId" IS NOT NULL;  -- Expected: 40+
  ```
- [ ] **Monitoring Dashboards Open**: New Relic, Vercel Analytics, Error Logs
- [ ] **Communication Channel Active**: #techtrend-alerts Slack channel notified

**Go/No-Go Decision**: If any check fails, postpone migration.

### Phase 1: Migration Execution (09:00-10:00)

#### Step 1: Announce Migration Start (09:00)

**Slack Notification** (#techtrend-alerts):
```
MIGRATION STARTING: Phase 2-A Production

Target: Enable USE_DATABASE_PROVIDER=true
Start time: [ISO timestamp]
Expected completion: 10:00
Incident Commander: [@ic]
On-call: [@oncall]

Monitoring: [New Relic dashboard URL]
Rollback runbook: operations/rollback-runbook-phase2a.md
```

#### Step 2: Set Environment Variable (09:05)

**Via Vercel Dashboard**:
1. Navigate to https://vercel.com/dashboard
2. Select `techtrend` project
3. Go to Settings → Environment Variables
4. Click "Add New"
5. Key: `USE_DATABASE_PROVIDER`
6. Value: `true`
7. Environment: Production
8. **Take screenshot** (before Save)
9. Click Save
10. **Take screenshot** (after Save)
11. Export env vars: `vercel env pull .env.after-migration`

**Record**: Environment variable change timestamp

#### Step 3: Trigger Production Deployment (09:10)

```bash
# Option A: Redeploy latest from Dashboard
# Deployments → Latest Production → Redeploy

# Option B: Via CLI
vercel --prod

# Option C: Via GitHub (if auto-deploy enabled)
git commit --allow-empty -m "chore: Trigger deployment for Phase 2-A migration"
git push
```

**Record**: Deployment URL, deployment start time

#### Step 4: Monitor Deployment (09:10-09:20)

- [ ] Deployment status: "Building"
- [ ] Build logs: No errors
- [ ] Deployment status: "Ready"
- [ ] Record deployment completion time
- [ ] Record final deployment URL

**Expected**: Deployment completes in 5-10 minutes

### Phase 2: Initial Monitoring (10:00-11:00)

**CRITICAL: First hour after migration**

#### Step 1: Immediate Verification (10:00-10:10)

```bash
# Run health check script
BASE_URL=https://techtrend.vercel.app npx tsx scripts/health-check-feature-flag.ts

# Expected output:
# Feature Flag: ENABLED (DB Provider)
# Overall Status: PASS
```

- [ ] Health check: PASS
- [ ] Feature Flag: ENABLED
- [ ] Provider Type: DatabaseCompanySourceProvider
- [ ] DB read/write paths: Working (24+ sources)

#### Step 2: Smoke Tests (10:10-10:20)

```bash
# Test all category filters
curl https://techtrend.vercel.app/api/sources?category=foreign
curl https://techtrend.vercel.app/api/sources?category=domestic
curl https://techtrend.vercel.app/api/sources?category=company

# Test all presets
curl https://techtrend.vercel.app/api/sources?preset=all
curl https://techtrend.vercel.app/api/sources?preset=daily
```

- [ ] All endpoints return HTTP 200
- [ ] Source counts match expectations
- [ ] Response times < 300ms

#### Step 3: Metrics Monitoring (10:20-11:00)

Monitor every 10 minutes:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Error Rate | < 0.5% | ___ | [ ] |
| P95 Latency | < 300ms | ___ | [ ] |
| DB Connection Pool | < 50% | ___ | [ ] |
| Cache Hit Rate | > 80% | ___ | [ ] |

**Rollback Trigger**: If any metric exceeds threshold for 5+ minutes, initiate rollback immediately.

#### Step 4: Error Log Review (10:30, 10:45, 11:00)

Check Vercel Error Logs:
- [ ] No provider-related errors
- [ ] No database query errors
- [ ] No cache-related errors
- [ ] No user-visible errors

### Phase 3: Extended Monitoring (11:00-18:00)

**Hourly checkpoints**: 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00

#### Hourly Checklist

- [ ] **Error Rate**: < 1% (loosened from initial 0.5%)
- [ ] **P95 Latency**: < 250ms (tightening toward 200ms SLA)
- [ ] **DB Connection Pool**: < 60%
- [ ] **Cache Hit Rate**: > 75%
- [ ] **User Reports**: No error reports
- [ ] **Functional Tests**: Spot-check filters and presets

#### On-call Handoff (if applicable)

If on-call shifts during monitoring window:
- [ ] Update handoff document with current status
- [ ] Share monitoring dashboard access
- [ ] Review rollback procedure with incoming on-call
- [ ] Document any anomalies observed so far

#### End-of-Day Status (18:00)

- [ ] **8-hour Summary**: Generate metrics report
- [ ] **Status Update**: Post to #techtrend-alerts
  ```
  MIGRATION UPDATE: Phase 2-A (8 hours)

  Status: [Stable/Issues Detected]
  Error rate: [X%]
  P95 latency: [Xms]
  DB pool: [X%]
  Cache hit rate: [X%]

  Next check: [Tomorrow 09:00]
  On-call: [@oncall-night]
  ```
- [ ] **On-call Handoff**: Brief night shift on-call

### Phase 4: Continuous Monitoring (Day 1-2, 48 hours)

#### Day 1 (Migration Day Evening + Night)

**Monitoring Frequency**: Every 3 hours

Checkpoints: 21:00, 00:00, 03:00, 06:00

- [ ] Automated alerts working correctly
- [ ] No critical errors
- [ ] Metrics within acceptable range
- [ ] On-call has not been paged

#### Day 2 (Migration +24 hours)

**Morning Review (09:00)**:
- [ ] Generate 24-hour metrics report
- [ ] Review error logs (past 24 hours)
- [ ] Verify alert threshold triggers (any false positives?)
- [ ] Check for any user-reported issues

**Metrics Review**:
- [ ] Error rate trend: Stable or decreasing
- [ ] P95 latency: Consistently < 200ms
- [ ] DB connection pool: Stable < 60%
- [ ] Cache hit rate: Stable > 80%

**Alert Adjustment** (after 24 hours):
- [ ] Relax initial strict thresholds to normal operating levels
  - Error rate: 1% → 2%
  - P95 latency: 300ms → 500ms (alert threshold, not SLA)
  - DB connection: 80% → 90%

#### Day 2 Evening (18:00, Migration +33 hours)

- [ ] Review second 24-hour period
- [ ] Confirm no degradation
- [ ] Prepare migration completion report

#### Migration Completion (Migration +48 hours)

- [ ] **48-Hour Report**: Generate final metrics summary
- [ ] **Success Criteria Met**: Verify all completion criteria (see below)
- [ ] **Stakeholder Notification**: Send migration completion email
- [ ] **Feature Flag Governance**: Update flag registry (owner, expiration date)
- [ ] **Post-Migration Review**: Schedule retrospective meeting

## Rollback Decision Criteria

Initiate rollback immediately if:

| Condition | Threshold | Duration |
|-----------|-----------|----------|
| Error Rate | > 2% | 5 minutes continuous |
| P95 Latency | > 500ms | 10 minutes continuous |
| DB Connection Saturation | > 90% | 5 minutes continuous |
| User Error Reports | 3+ reports | 30 minutes |
| Data Inconsistency | Any detection | Immediate |

**Rollback Procedure**: See `operations/rollback-runbook-phase2a.md`

## Success Criteria

Migration is considered successful when:

- [ ] **48 hours error-free operation**: No provider-related errors
- [ ] **Performance SLA met**: P95 latency < 200ms consistently
- [ ] **Cache performance**: Hit rate > 80%
- [ ] **No user errors**: Zero user-reported issues
- [ ] **CI tests passing**: Continuous E2E test success with flag=true
- [ ] **Database integrity**: SourceGroup/Source data consistent
- [ ] **Functional verification**: All filters, presets, company modal working

## Preview Environment Testing

### When to Execute
1-2 days before production migration

### Testing Procedure

#### 1. Environment Setup (30 minutes)

```bash
# Set USE_DATABASE_PROVIDER=true in Preview environment
vercel env add USE_DATABASE_PROVIDER preview
# Value: true

# Deploy to preview
git push origin feature/phase2a-production-migration
# Or: vercel --preview
```

#### 2. Health Check (10 minutes)

```bash
# Run health check against Preview
BASE_URL=https://techtrend-<hash>.vercel.app npx tsx scripts/health-check-feature-flag.ts

# Verify:
# - Feature Flag: ENABLED
# - Provider Type: DatabaseCompanySourceProvider
# - DB read paths: Working
# - API endpoint: Responding
```

#### 3. Cache Warm-up Rehearsal (30 minutes)

**Purpose**: Simulate cold start and measure warm-up time

```bash
# Optional: Flush Preview Redis cache (if accessible)
# This simulates production cold start
redis-cli -h <preview-redis> FLUSHDB

# Measure cold cache latency
time curl https://techtrend-<hash>.vercel.app/api/sources?category=company
# Record: Initial latency (cold)

# Wait 5 minutes, repeat
time curl https://techtrend-<hash>.vercel.app/api/sources?category=company
# Record: Latency after warm-up

# Expected:
# - Cold: < 500ms
# - Warm: < 200ms
```

#### 4. Dual Provider Smoke Test (20 minutes)

**Purpose**: Verify DB Provider returns same data as Static Provider

```bash
# Test with flag=false (static)
USE_DATABASE_PROVIDER=false npx tsx scripts/compare-providers.ts > static-output.txt

# Test with flag=true (database)
USE_DATABASE_PROVIDER=true npx tsx scripts/compare-providers.ts > db-output.txt

# Compare outputs
diff static-output.txt db-output.txt

# Expected: Minimal differences (only ordering or metadata)
# Any major discrepancy = investigate before production
```

#### 5. Extended Monitoring (2-3 hours minimum)

**Recommended**: Monitor Preview for at least 2-3 hours, ideally covering both:
- Daytime traffic pattern (09:00-18:00)
- Evening/night pattern (18:00-24:00)

Monitor:
- [ ] Error rate: 0%
- [ ] P95 latency: < 200ms
- [ ] No anomalies in error logs
- [ ] All functional tests pass

#### 6. Preview Approval

- [ ] All tests passed
- [ ] No issues detected in monitoring window
- [ ] Approval documented in Slack
- [ ] Ready to proceed to production

## Detailed Migration Steps

### Phase 1: Pre-Flight Checks (08:30-09:00)

#### Team Assembly (08:30)

**Required Attendees**:
- On-call Engineer (executor)
- Incident Commander (decision maker)
- QA/Monitoring (verifier)
- Product Owner (stakeholder)

**Pre-Flight Checklist**:
- [ ] All team members present and ready
- [ ] Monitoring dashboards accessible
- [ ] Rollback runbook reviewed
- [ ] Communication channels active

#### System Health Verification (08:35)

```bash
# Verify production services
curl -I https://techtrend.vercel.app
# Expected: HTTP 200

# Check database connectivity
# Via Vercel Postgres dashboard or CLI

# Check Redis health
# Via Vercel KV dashboard or monitoring

# Verify latest CI build passed
gh run list --branch main --limit 1 --json status,conclusion
```

- [ ] Application: Healthy
- [ ] Database: Healthy
- [ ] Redis: Healthy
- [ ] CI: Passing

#### Database State Verification (08:45)

```sql
-- Connect to production database
-- Verify Phase 2-A migrations applied

SELECT COUNT(*) FROM "SourceGroup";
-- Expected: 6

SELECT COUNT(*) FROM "SourceTag";
-- Expected: 12+

SELECT COUNT(*) FROM "Source" WHERE "groupId" IS NOT NULL;
-- Expected: 40+

-- Verify no orphaned sources
SELECT COUNT(*) FROM "Source" WHERE "groupId" IS NULL AND "type" = 'corporate_blog';
-- Expected: 0
```

- [ ] SourceGroup count: 6
- [ ] SourceTag count: 12+
- [ ] Sources with groupId: 40+
- [ ] No orphaned sources

#### Go/No-Go Decision (08:55)

**Incident Commander reviews**:
- [ ] All pre-flight checks passed
- [ ] Team ready
- [ ] No blocking issues

**Decision**: GO / NO-GO

If NO-GO: Postpone migration, document reason, reschedule.

### Phase 1: Migration Execution (09:00-09:20)

#### Step 1: Migration Start Announcement (09:00)

Post to #techtrend-alerts:
```
MIGRATION STARTING: Phase 2-A Production

Enabling DB-backed Source Provider (USE_DATABASE_PROVIDER=true)

Start: [ISO timestamp]
Expected completion: 09:20
Team: IC=[@ic], On-call=[@oncall], QA=[@qa]

Status updates: Every 15 minutes
Rollback ready: operations/rollback-runbook-phase2a.md
```

#### Step 2: Environment Variable Configuration (09:05)

**Execute** (via Vercel Dashboard or CLI):

```bash
# Method 1: Dashboard
# 1. Settings → Environment Variables
# 2. Add: USE_DATABASE_PROVIDER = true (Production)
# 3. Save
# 4. Screenshot saved

# Method 2: CLI
vercel env add USE_DATABASE_PROVIDER production
# Value: true

# Verify
vercel env ls production | grep USE_DATABASE_PROVIDER
```

**Record**:
- Configuration method: [Dashboard/CLI]
- Timestamp: [ISO]
- Screenshot path: [path]

#### Step 3: Trigger Deployment (09:10)

```bash
# Redeploy production
vercel --prod

# Monitor deployment
vercel inspect <deployment-url>
```

**Record**:
- Deployment ID: [ID]
- Deployment URL: [URL]
- Start time: [ISO]

#### Step 4: Deployment Monitoring (09:10-09:20)

Monitor deployment logs for:
- [ ] Build phase: No errors
- [ ] Prisma generate: Success
- [ ] Next.js build: Success
- [ ] Deployment status: "Ready"

**Record**:
- Completion time: [ISO]
- Build duration: [X minutes]

### Phase 2: Initial Monitoring (10:00-11:00)

**CRITICAL HOUR: Highest attention required**

#### Immediate Verification (10:00-10:10)

**Health Check**:
```bash
BASE_URL=https://techtrend.vercel.app npx tsx scripts/health-check-feature-flag.ts
```

Checklist:
- [ ] Feature Flag: ENABLED
- [ ] Provider: DatabaseCompanySourceProvider
- [ ] getSources(): 24+ sources
- [ ] getSourcesByCategory(): 13+ sources (group_company_japan)
- [ ] API endpoint: HTTP 200
- [ ] Overall Status: PASS

**If FAIL**: Investigate immediately, consider rollback.

#### Smoke Tests (10:10-10:20)

Test all major functionality:
```bash
# Homepage
curl -I https://techtrend.vercel.app
# Expected: HTTP 200

# Category filters
for cat in foreign domestic company; do
  curl https://techtrend.vercel.app/api/sources?category=$cat | jq '.sources | length'
done
# Expected: Non-zero counts

# Presets
for preset in all daily weekly interesting; do
  curl "https://techtrend.vercel.app/api/articles?preset=$preset&limit=10" | jq '.articles | length'
done
# Expected: Results returned
```

Functional tests (manual):
- [ ] Homepage loads correctly
- [ ] Category filters display sources
- [ ] Company filter modal opens and shows companies
- [ ] Presets work correctly
- [ ] No visual regressions

#### Intensive Monitoring (10:20-11:00)

**Every 10 minutes** (10:30, 10:40, 10:50, 11:00):

**Metrics Check**:
```bash
# New Relic NRQL (or dashboard)
# Error rate (last 10 min)
SELECT count(*) FROM Transaction WHERE error IS true

# P95 latency (last 10 min)
SELECT percentile(duration, 95) FROM Transaction

# Database query duration
SELECT percentile(databaseDuration, 95) FROM Transaction
```

**Record in table**:

| Time | Error Rate | P95 Latency | DB Pool | Cache Hit | Notes |
|------|------------|-------------|---------|-----------|-------|
| 10:30 | ___ | ___ | ___ | ___ | ___ |
| 10:40 | ___ | ___ | ___ | ___ | ___ |
| 10:50 | ___ | ___ | ___ | ___ | ___ |
| 11:00 | ___ | ___ | ___ | ___ | ___ |

**Rollback Decision**: If any checkpoint shows degradation, evaluate rollback criteria.

### Phase 3: Extended Monitoring (11:00-18:00)

**Hourly checkpoints**: 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00

#### Hourly Review Checklist

- [ ] **Error Rate**: < 1%
- [ ] **P95 Latency**: < 200ms (SLA target)
- [ ] **DB Connection Pool**: Stable trend
- [ ] **Cache Hit Rate**: > 80%
- [ ] **Prisma Slow Queries**: None exceeding 100ms
- [ ] **User Reports**: Zero issues
- [ ] **Feature Flag Evaluation**: Logs confirm flag=true

#### Functional Spot Checks (Every 2 hours)

- [ ] Test company filter: Modal loads, shows 13+ companies
- [ ] Test presets: All 4 presets return results
- [ ] Test category toggle: Foreign/Domestic/Company filters work

#### End-of-Day Status (18:00)

**8-Hour Summary**:
```
MIGRATION STATUS: Phase 2-A (8 hours complete)

Metrics:
- Error rate: [average over 8h] (target: < 1%)
- P95 latency: [P95 over 8h] (target: < 200ms)
- DB pool peak: [max %] (target: < 70%)
- Cache hit rate: [average] (target: > 80%)

Issues: [None / List any anomalies]

User feedback: [None / Summary of reports]

Next steps:
- Continue 24h monitoring
- Review again at 09:00 tomorrow
- On-call: [@night-oncall]
```

Post to #techtrend-alerts and email stakeholders.

### Phase 4: 48-Hour Monitoring (Day 1-2)

#### Day 1 Evening/Night (18:00-09:00 next day)

**Automated Monitoring Only**:
- Alerts configured with stricter thresholds
- On-call available for paging
- No active monitoring required (rely on alerts)

**Checkpoints** (if on-call performs manual checks):
- 21:00, 00:00, 03:00, 06:00

#### Day 2 Morning Review (09:00, Migration +24h)

**24-Hour Retrospective**:
```bash
# Generate 24h metrics report
# Via New Relic or custom script

# Review:
# - Total request count
# - Error count and rate
# - Latency distribution (P50/P95/P99)
# - DB query performance
# - Cache performance
```

Checklist:
- [ ] No rollback triggered
- [ ] Error rate: < 1% (24h average)
- [ ] P95 latency: < 200ms (24h P95)
- [ ] Cache hit rate: > 80% (24h average)
- [ ] No user complaints
- [ ] All alerts functioned correctly

**Alert Threshold Adjustment**:
- [ ] Relax to normal operating thresholds
- [ ] Document new baseline performance

#### Day 2 Afternoon/Evening (09:00-18:00, Migration +24-33h)

**Reduced Monitoring**:
- Manual checks every 3-4 hours
- Rely primarily on automated alerts
- Focus on trend analysis rather than real-time

#### Migration Completion (Migration +48h)

**Final Review**:
- [ ] 48 hours error-free operation
- [ ] Performance SLA consistently met
- [ ] No user-reported issues
- [ ] All functional tests passing
- [ ] Database integrity maintained

**Completion Actions**:
- [ ] Post completion announcement to #techtrend-alerts
- [ ] Send stakeholder completion email
- [ ] Update feature flag registry
- [ ] Schedule post-migration retrospective
- [ ] Archive monitoring data for future reference

## Communication Templates

### Migration Start (09:00)

**Slack** (#techtrend-alerts):
```
MIGRATION STARTING: Phase 2-A Production

Target: Enable DB-backed Source Provider
Start: [timestamp]
Completion: ~09:20
Monitoring: Until [timestamp +48h]

Team:
- IC: [@ic]
- On-call: [@oncall]
- QA: [@qa]

Runbooks:
- Migration: operations/production-migration-phase2a.md
- Rollback: operations/rollback-runbook-phase2a.md

Updates: Every 15 min (Phase 1), hourly (Phase 2-3)
```

### Hourly Status Update

**Slack** (#techtrend-alerts):
```
Phase 2-A Status Update (T+[X]h)

Error rate: [X%] (target: <1%)
P95 latency: [Xms] (target: <200ms)
DB pool: [X%] (target: <60%)
Cache hit: [X%] (target: >80%)

Issues: None / [Brief description]
Next update: T+[X+1]h
```

### Migration Completion (Migration +48h)

**Email** (Stakeholders):
```
Subject: Phase 2-A Production Migration Complete

Dear Team,

The Phase 2-A production migration has been successfully completed.

Summary:
- Migration started: [timestamp]
- Migration completed: [timestamp]
- Monitoring period: 48 hours
- User impact: None
- Downtime: None

Performance:
- Error rate: [X%] (target: <1%, achieved)
- P95 latency: [Xms] (target: <200ms, achieved)
- Cache hit rate: [X%] (target: >80%, achieved)

Next steps:
- Post-migration retrospective: [date/time]
- Feature flag review: [date]

Thank you for your support.

Best regards,
[Engineering Team]
```

## Dependency Services

### Internal Dependencies

- [ ] **Database**: PostgreSQL (no changes required)
- [ ] **Cache**: Redis (automatic, no changes required)
- [ ] **Auth**: Next-Auth (no changes required)

### External Dependencies

- [ ] **Monitoring**: New Relic/Vercel Analytics (already configured)
- [ ] **CDN**: Vercel Edge Network (no changes required)
- [ ] **DNS**: No changes required

**Note**: No external service notifications required for this migration.

## Feature Flag Governance

### Post-Migration

**After 48-hour success**:
- [ ] Update feature flag registry:
  - Flag: USE_DATABASE_PROVIDER
  - Owner: Backend Team
  - Status: Enabled (Production)
  - Enabled date: [migration date]
  - Review date: [+1 month]
  - Cleanup date: [+2 months, after legacy code removal]

**Long-term Plan**:
- Month 1: Monitor flag, keep legacy code
- Month 2: Plan legacy Static Provider removal
- Month 3: Remove flag and legacy code (if stable)

## Appendix

### A. Stakeholder Approval Meeting Agenda

**Meeting**: 2 days before migration
**Duration**: 30-60 minutes
**Attendees**: Engineering, Product, QA, On-call

**Agenda**:
1. Phase 2-A recap (5 min)
2. Migration plan walkthrough (10 min)
3. Risk analysis and rollback criteria (10 min)
4. Timeline and monitoring plan (10 min)
5. Q&A (10 min)
6. Approval decision (5 min)

**Required Approval**: Product Owner, Engineering Lead

### B. Database Backup Procedure

**Before migration**:
```bash
# Via Vercel Postgres CLI (if available)
vercel postgres backup create

# Or via provider dashboard
# Record backup ID and timestamp
```

**Backup verification**:
- [ ] Backup ID: [ID]
- [ ] Timestamp: [ISO]
- [ ] Size: [MB]
- [ ] Status: Complete

### C. Log Level Adjustment (Optional)

**Increase logging temporarily** (first 24 hours):

```typescript
// In lib/config/feature-flags.ts (temporary)
const DEBUG_PHASE_2A = process.env.DEBUG_PHASE_2A === 'true';

if (DEBUG_PHASE_2A && FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
  console.log('[Phase 2-A] DB Provider enabled, source count:', sources.length);
}
```

**Remember to remove** after 48-hour monitoring period.

### D. On-call Handoff Template

**When**: Every on-call shift change during 48-hour window

**Handoff Document**:
```
Phase 2-A On-call Handoff

Outgoing: [@previous-oncall]
Incoming: [@new-oncall]
Time: [timestamp]

Current Status:
- Migration state: [In progress / Monitoring / Stable]
- Time since migration: [Xh]
- Error rate: [X%]
- P95 latency: [Xms]
- Any issues: [None / Description]

Action items for incoming:
- [ ] Review latest metrics (past 2h)
- [ ] Check for any alerts
- [ ] Familiarize with rollback procedure
- [ ] Next manual check: [time]

Runbooks:
- Migration: operations/production-migration-phase2a.md
- Rollback: operations/rollback-runbook-phase2a.md

Escalation: [Incident Commander contact]
```

## References

- **Rollback Runbook**: `operations/rollback-runbook-phase2a.md`
- **Health Check Script**: `scripts/health-check-feature-flag.ts`
- **Monitoring Setup**: `operations/monitoring-setup-phase2a.md`
- **Investigation Report**: `.claude/docs/investigate/investigate_20251116_182844_528_phase2a-production-migration.md`
- **Implementation Plan**: `.claude/docs/plan/plan_20251116_191759_334_phase2a-production-migration.md`
- **Phase 2-A PRs**: #208, #209, #210, #211, #212
