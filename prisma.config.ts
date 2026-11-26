import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./scripts/db/migration-database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Vercel の本番のビルドの migrate deploy だけ、管理者のロールで流す（scripts/db/migration-database-url.ts）
    url: migrationDatabaseUrl(process.env),
  },
});
