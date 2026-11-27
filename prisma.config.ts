import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./scripts/db/migration-database-url";
import { SHADOW_DB_INIT_SQL } from "./scripts/db/shadow-db-init";

export default defineConfig({
  // initShadowDb を使うのに要る。外部の表（tables.external）は登録しないので、ほかの動きは変わらない
  experimental: { externalTables: true },
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
    // migrate dev のシャドウ DB に、マイグレーションの記録の表を先に作る（scripts/db/shadow-db-init.ts）
    initShadowDb: SHADOW_DB_INIT_SQL,
  },
  datasource: {
    // Vercel の本番のビルドの migrate deploy だけ、管理者のロールで流す（scripts/db/migration-database-url.ts）
    url: migrationDatabaseUrl(process.env),
  },
});
