# Scripts Directory Management Guidelines

## Directory Structure

```
scripts/
├── scheduled/     # Scheduled scripts (PM2/CI) - permanent
├── manual/        # Manual execution scripts - permanent
├── maintenance/   # Maintenance scripts - permanent
├── ci/            # CI/CD scripts - permanent
├── dev/           # Development utilities - permanent
├── rag/           # RAG-related scripts - permanent
├── utils/         # Shell utilities - permanent
├── db/            # Database scripts - permanent
├── migration/
│   ├── archive/   # Legacy migrations (V6-V8)
│   └── (current)  # Active migration scripts
├── test/
│   ├── _archive/  # Archived test scripts (2024-11-28)
│   └── (active)   # Active test utilities
├── fix/
│   └── _archive/  # Completed fix scripts
├── _archive/      # Other archived scripts
└── temp/          # Temporary scripts (.gitignore)
```

## Script Classification

### Permanent Scripts

| Directory | Purpose | Example |
|-----------|---------|---------|
| scheduled/ | PM2/cron scheduled jobs | collect-feeds.ts |
| manual/ | On-demand tools | compare-summaries.ts |
| maintenance/ | System maintenance | generate-summaries.ts |
| ci/ | CI/CD pipelines | run-golden-set-regression.ts |
| dev/ | Development utilities | run-embedding-worker.ts |
| rag/ | RAG/embedding operations | backfill-embeddings.ts |

### Archived Scripts

Scripts that are no longer actively used but preserved for reference:

- `test/_archive/` - 92 ad-hoc test scripts (archived 2024-11-28)
- `migration/archive/` - V6/V7/V8 migration scripts (current: V9)
- `fix/_archive/` - 15 completed one-time fixes
- `_archive/` - Other superseded scripts

**Archive Policy:**
- Archived scripts are preserved for 2 weeks minimum
- After verification period, may be permanently deleted
- Git history preserves all changes

### Temporary Scripts (temp/)

- Not tracked in Git
- For debugging, experiments, one-time fixes
- Delete after use

## Naming Conventions

- Use kebab-case: `collect-feeds.ts`
- Start with verb: `generate-`, `fix-`, `test-`
- Be specific: `regenerate-low-quality-summaries.ts`

## Key Scripts

### scheduled/ - Scheduled Jobs
- `scheduler.ts` - PM2 scheduler entry point
- `collect-feeds.ts` - RSS/API feed collection
- `manage-summaries.ts` - Summary generation
- `manage-quality-scores.ts` - Quality score calculation
- `delete-low-quality-articles.ts` - Cleanup

### ci/ - CI/CD
- `run-golden-set-regression.ts` - AI regression tests
- `calibrate-thresholds.ts` - Threshold calibration

### test/ - Test Utilities (Active)
- `reset-test-db.ts` - Test database reset
- `setup-test-db.ts` - Test database setup
- `seed-test.sql` - Test seed data

## Adding New Scripts

1. Choose appropriate directory (scheduled/, manual/, maintenance/, etc.)
2. Follow naming conventions
3. Add package.json command if needed
4. Document purpose in file header

## Cleanup History

- 2025-11-28: Root directory organization
  - Moved 28 scripts from root to appropriate directories
  - db/: Test user scripts, export-db-to-seed.ts
  - dev/: generate-css-tokens.ts, compare-providers.ts, health-check-*.ts
  - maintenance/: analyze-*, check-*, enrich-*, regenerate-*, etc.
  - manual/: add-*, fetch-and-save-*, save-* scripts
  - Updated 4 package.json paths

- 2025-11-28: Major cleanup (Phase 1)
  - Archived 92 unused test scripts
  - Archived 6 legacy migration scripts (V6-V8)
  - Archived 15 completed fix scripts
  - Deleted 3 one-time scripts
  - Removed 5 deprecated package.json commands
