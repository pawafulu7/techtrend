/**
 * Prisma がスキーマの照合に使うシャドウ DB（`prisma migrate dev` と `prisma migrate diff --from-migrations`。
 * CI の db:check-schema も使う）に、マイグレーションを流す前に流す SQL（prisma.config.ts と prisma/schema-check.config.ts の
 * migrations.initShadowDb）。
 *
 * シャドウ DB では、Prisma はマイグレーションの SQL をそのまま流すだけで、マイグレーションの記録の表（_prisma_migrations）を
 * 作らない。マイグレーション 20261127000000_add_readonly_content_role は、その表の列を techtrend_readonly に GRANT するので、
 * 表が無いと失敗する。そこで同じ形の表を先に作る（列は Prisma が作る表と同じ。本番などの実際の DB には Prisma が先に作るので
 * 流さない。Prisma はスキーマの照合でこの表を数えない）
 */
export const SHADOW_DB_INIT_SQL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;
