# Phase 2-A Rollback Runbook

## Document Information

- **Version**: 1.0
- **Last Updated**: 2025-11-16
- **Owner**: Backend Team
- **Purpose**: Emergency rollback procedure for Phase 2-A production migration

## Overview

### Rollback Target
- Feature Flag: `USE_DATABASE_PROVIDER=false` (disable DB-backed provider)
- Scope: Revert to Static Company Source Provider

### Impact
- **Downtime**: None (Feature Flag controlled)
- **Data Loss**: None (SourceGroup/SourceTag data preserved)
- **User Impact**: None (transparent fallback to legacy provider)

### Estimated Time
- **Total**: 5-10 minutes
- **Environment Variable Change**: 1-2 minutes
- **Redeploy**: 3-5 minutes
- **Verification**: 2-3 minutes

## Rollback Decision Criteria

### Automatic Triggers (Monitoring Alerts)

Monitor the following metrics and initiate rollback if any threshold is exceeded:

| Metric | Threshold | Duration | Action |
|--------|-----------|----------|--------|
| Error Rate | > 2% | 5 minutes continuous | Immediate rollback |
| P95 Latency | > 500ms | 10 minutes continuous | Immediate rollback |
| DB Connection Saturation | > 90% | 5 minutes continuous | Immediate rollback |
| Cache Hit Rate | < 50% | 15 minutes continuous | Investigate, consider rollback |

**Note**: These are initial thresholds for first deployment. Adjust based on baseline performance after migration stabilizes.

### Manual Triggers

Initiate rollback immediately if:
- Multiple user-visible error reports (3+ reports within 30 minutes)
- Data inconsistency detected (SourceGroup/Source mismatch)
- Critical functionality broken (filter/preset loading failures)
- Security incident related to new provider code

### Monitoring Dashboards

Check the following dashboards for threshold monitoring:

- **New Relic**: https://one.newrelic.com → APM & Services → techtrend-web
- **Vercel Analytics**: https://vercel.com/dashboard → Analytics → Speed Insights
- **Error Logs**: Vercel Dashboard → Logs (filter by "error")

## Roles and Responsibilities

| Role | Responsibility | Contact |
|------|---------------|---------|
| On-call Engineer | Execute rollback procedure | [Slack: @oncall] |
| Incident Commander | Approve rollback decision | [Slack: @ic] |
| QA/Monitoring | Verify rollback success | [Slack: @qa] |
| Product Owner | Stakeholder communication | [Slack: @po] |

**Escalation Path**: On-call → Incident Commander → CTO

**Note**: Fill in specific contact information before migration.

## Pre-Rollback Preparation

### Before Production Migration (Prepare Now)

- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Verify Vercel authentication: `vercel whoami`
- [ ] Record last known good build URL (with USE_DATABASE_PROVIDER=false)
- [ ] Save current environment variables: `vercel env pull .env.production.backup`
- [ ] Confirm access to Vercel Dashboard and New Relic
- [ ] Test rollback procedure in Preview environment (dry run)

### At Rollback Decision Time

- [ ] Confirm decision with Incident Commander
- [ ] Notify stakeholders in #techtrend-alerts Slack channel
- [ ] Record rollback start time: `date -Iseconds`
- [ ] Take screenshot of current Vercel environment variables (before change)

## Rollback Procedures

### Option A: Vercel Dashboard (Recommended)

**Step 1: Access Environment Variables**
1. Navigate to https://vercel.com/dashboard
2. Select `techtrend` project
3. Go to Settings → Environment Variables

**Step 2: Update USE_DATABASE_PROVIDER**
1. Find `USE_DATABASE_PROVIDER` variable
2. Click Edit
3. Change value from `true` to `false`
4. Save
5. **Take screenshot** (after change)

**Step 3: Trigger Redeploy**
1. Go to Deployments tab
2. Find latest Production deployment
3. Click "..." menu → Redeploy
4. Confirm redeploy
5. Wait for deployment to complete (5-10 minutes)

**Step 4: Verify Deployment**
1. Check deployment status: "Ready"
2. Note deployment URL
3. Record completion time: `date -Iseconds`

### Option B: Vercel CLI

**Step 1: Check Current Environment Variables**
```bash
# List current environment variables
vercel env ls production

# Pull current values for backup
vercel env pull .env.before-rollback
```

**Step 2: Update Environment Variable**
```bash
# Remove USE_DATABASE_PROVIDER from production
vercel env rm USE_DATABASE_PROVIDER production

# Or update to false
vercel env add USE_DATABASE_PROVIDER production
# Enter value: false
```

**Step 3: Verify Change**
```bash
# Verify the change
vercel env ls production

# Confirm USE_DATABASE_PROVIDER is absent or set to false
```

**Step 4: Trigger Redeploy**
```bash
# Deploy to production
vercel --prod

# Wait for deployment to complete
vercel inspect <deployment-url>
```

### Option C: GitHub Trigger (Fallback)

**Step 1: Create Empty Commit**
```bash
git checkout main
git pull
git commit --allow-empty -m "Rollback: Disable DB Provider (USE_DATABASE_PROVIDER=false)"
git push
```

**Step 2: Update Vercel Environment Variable**
- Follow Option A (Vercel Dashboard) to set USE_DATABASE_PROVIDER=false

**Step 3: Wait for Auto-Deploy**
- GitHub push triggers automatic Vercel deployment
- Monitor deployment in Vercel Dashboard

## Post-Rollback Verification

### Immediate Verification (0-5 minutes)

**Step 1: Run Health Check Script**
```bash
# From local machine or CI
BASE_URL=https://techtrend.vercel.app npx tsx scripts/health-check-feature-flag.ts

# Expected output:
# Feature Flag: DISABLED (Static Provider)
# Overall Status: PASS
```

**Step 2: Smoke Test API Endpoint**
```bash
# Test company sources endpoint
curl -i https://techtrend.vercel.app/api/sources?category=company

# Expected: HTTP 200, sources array returned
```

**Step 3: Check Error Logs**
```bash
# Vercel Dashboard → Logs
# Filter: last 15 minutes, level=error

# Expected: No new errors related to provider
```

### Extended Verification (5-30 minutes)

**Step 4: Verify Metrics**
- [ ] Error rate < 1%
- [ ] P95 latency < 200ms
- [ ] DB connection pool < 50% utilization
- [ ] No user-visible errors

**Step 5: Functional Testing**
- [ ] Homepage loads correctly
- [ ] Category filters work (foreign, domestic, company)
- [ ] Presets load correctly (all, daily, weekly, interesting)
- [ ] Company filter modal works

## Data Integrity Verification

### Database State Check

**SourceGroup/SourceTag Preserved**:
```sql
-- Run in production database
SELECT COUNT(*) FROM "SourceGroup";  -- Expected: 6
SELECT COUNT(*) FROM "SourceTag";    -- Expected: 12+
SELECT COUNT(*) FROM "Source" WHERE "groupId" IS NOT NULL;  -- Expected: 40+
```

**Note**: Data remains intact; Static Provider simply ignores it.

### Legacy Provider Validation

**Static Provider Data Source**:
- Verify that Static Provider reads from `lib/constants/source-categories.ts`
- Confirm SOURCE_CATEGORIES contains expected company sources
- No database dependency in static provider path

## Cache Management

### Redis Cache Handling

**Principle**: Cache flush is **NOT required** for rollback.

**Rationale**:
- Static Provider does not use SourceGroup/SourceTag cache keys
- Cache TTL (5 minutes) will naturally expire
- No data inconsistency risk

**Exception** (Only if data inconsistency is confirmed cache-related AND approved by Incident Commander):

```bash
# Connect to Redis
docker exec -it techtrend-redis redis-cli

# Or on Vercel/production (if Redis CLI available)
redis-cli -h <redis-host> -p <redis-port> -a <redis-password>

# STEP 1: List cache keys first (DO NOT skip this step)
KEYS company-sources*
KEYS company-sources:group:*
KEYS company-sources:tag:*

# STEP 2: Review key list with IC before proceeding

# STEP 3: Only delete specific keys (NEVER use FLUSHDB)
DEL company-sources
DEL company-sources:group:group_company_japan
# ... repeat for other affected keys only
```

**WARNING**: NEVER use `FLUSHDB` or `FLUSHALL` in production. Only delete specific keys after IC approval and key list confirmation.

## Communication and Escalation

### Rollback Initiation Notification

**Slack Template** (#techtrend-alerts):
```
ROLLBACK INITIATED: Phase 2-A Production Migration

Reason: [Brief description, e.g., "Error rate exceeded 2% threshold"]
Trigger: [Automatic alert / Manual decision]
Started: [ISO timestamp]
Expected completion: [+10 minutes]
Incident Commander: [@ic-handle]
On-call: [@oncall-handle]

Monitoring: [New Relic dashboard URL]
```

### Stakeholder Notification

**Email Template** (Product Owner, CTO):
```
Subject: [Action Required] Phase 2-A Rollback in Progress

Dear Team,

We have initiated a rollback of the Phase 2-A production migration due to [reason].

Timeline:
- Rollback started: [timestamp]
- Expected completion: [+10 minutes]
- User impact: None (transparent fallback)

We will provide an update once verification is complete and root cause analysis is underway.

Best regards,
[On-call Engineer]
```

### Escalation Contacts

| Level | Contact | Trigger |
|-------|---------|---------|
| L1 | On-call Engineer | Initial detection |
| L2 | Incident Commander | Rollback decision |
| L3 | CTO | Prolonged incident (>30 min) |

**Note**: Update with actual contact information (Slack handles, phone numbers) before migration.

## Post-Rollback Actions

### Immediate (0-1 hour)

- [ ] Record rollback completion time
- [ ] Update incident timeline in Slack thread
- [ ] Confirm all verification steps passed
- [ ] Notify stakeholders of rollback completion
- [ ] Begin initial root cause investigation

### Short-term (1-24 hours)

- [ ] Root cause analysis (RCA) investigation
- [ ] Document what went wrong
- [ ] Identify fix for next migration attempt
- [ ] Schedule post-incident review meeting
- [ ] Collect logs and metrics for analysis

### Long-term (1-7 days)

- [ ] Complete RCA document
- [ ] Update migration plan based on lessons learned
- [ ] Re-test fix in Preview environment
- [ ] Schedule next migration attempt (if applicable)
- [ ] Update runbook based on lessons learned

## Rollback Success Criteria

Rollback is considered successful when:

- [ ] Health check script returns PASS (Static Provider)
- [ ] Error rate < 1% for 30 minutes continuous
- [ ] P95 latency < 200ms
- [ ] No user-visible errors reported
- [ ] All functional tests pass
- [ ] Database data integrity confirmed
- [ ] Stakeholders notified of completion

## Timeline Recording Template

Use this template to record rollback timeline in incident report:

```
Rollback Timeline - Phase 2-A

Detection:
  - Time: [ISO timestamp]
  - Trigger: [Alert/Manual]
  - Detected by: [Name/Role]
  - Metric that triggered: [Error rate/Latency/etc.]

Decision:
  - Time: [ISO timestamp]
  - Approved by: [Incident Commander name]
  - Reason: [Brief description]
  - Decision recorded in: [Slack thread URL]

Execution:
  - Start: [ISO timestamp]
  - Method: [Dashboard/CLI/GitHub]
  - Executed by: [On-call engineer name]
  - Vercel env var before: [Screenshot saved to: path]
  - Vercel env var after: [Screenshot saved to: path]
  - Redeploy URL: [Vercel deployment URL]
  - Completion: [ISO timestamp]

Verification:
  - Health check: [PASS/FAIL] at [timestamp]
  - Smoke test: [PASS/FAIL] at [timestamp]
  - Metrics check: [PASS/FAIL] at [timestamp]
  - Functional test: [PASS/FAIL] at [timestamp]

Notification:
  - Stakeholders notified: [timestamp]
  - RCA initiated: [timestamp]
  - Incident closed: [timestamp]
```

## Feature Flag Governance Post-Rollback

### Immediate Actions

- [ ] Lock `USE_DATABASE_PROVIDER` flag (prevent re-enable until RCA complete)
- [ ] Document flag state in incident report
- [ ] Update flag ownership/expiration in feature flag registry
- [ ] Block any automated flag toggle systems

### Re-Migration Prerequisites

Before attempting Phase 2-A migration again:

- [ ] RCA complete and fix validated
- [ ] Fix tested in Preview environment (48+ hours stable)
- [ ] All E2E tests pass with USE_DATABASE_PROVIDER=true
- [ ] Performance benchmarks meet SLA (P95 < 200ms)
- [ ] Stakeholder approval obtained
- [ ] Updated rollback procedure (if needed based on RCA)
- [ ] Post-mortem review meeting completed

## Appendix

### A. Vercel Environment Variable Diff Checklist

**Before rollback**:
- [ ] Take screenshot of current environment variables (save to incident folder)
- [ ] Export environment variables: `vercel env pull .env.before-rollback`
- [ ] Record USE_DATABASE_PROVIDER=true state
- [ ] Note current deployment URL and timestamp

**After rollback**:
- [ ] Take screenshot of updated environment variables (save to incident folder)
- [ ] Export environment variables: `vercel env pull .env.after-rollback`
- [ ] Confirm USE_DATABASE_PROVIDER=false state
- [ ] Generate diff: `diff .env.before-rollback .env.after-rollback`
- [ ] Save diff for post-incident review

### B. Monitoring URLs

- **New Relic APM**: https://one.newrelic.com/nr1-core?filters=(domain%3D%27APM%27ANDtype%3D%27APPLICATION%27ANDname%3D%27techtrend-web%27)
- **Vercel Logs**: https://vercel.com/[org]/techtrend/logs
- **Vercel Analytics**: https://vercel.com/[org]/techtrend/analytics
- **GitHub Actions**: https://github.com/[org]/techtrend/actions

**Note**: Replace [org] with actual organization name.

### C. Common Issues and Solutions

**Issue**: Rollback completed but errors continue
- **Cause**: Cache not cleared, old deployment still serving some requests
- **Solution**: Wait 5 minutes for cache TTL expiration, verify deployment URL is correct

**Issue**: Health check shows Provider mismatch
- **Cause**: Environment variable not propagated to all instances
- **Solution**: Wait 2-3 minutes for propagation, re-run health check, confirm deployment status is "Ready"

**Issue**: Database connection errors after rollback
- **Cause**: Legacy provider trying to read from database (should not happen)
- **Solution**: Verify Static Provider code path, check SOURCE_CATEGORIES constant, review recent code changes

**Issue**: Metrics not improving after rollback
- **Cause**: Unrelated issue, rollback may not be root cause
- **Solution**: Continue investigation, consider other recent changes, review full error logs

## References

- **Investigation Report**: `.claude/docs/investigate/investigate_20251116_182844_528_phase2a-production-migration.md`
- **Implementation Plan**: `.claude/docs/plan/plan_20251116_191759_334_phase2a-production-migration.md`
- **Health Check Script**: `scripts/health-check-feature-flag.ts`
- **Migration Procedure**: `operations/production-migration-phase2a.md`
- **Phase 2-A PRs**: #208, #209, #210, #211, #212
