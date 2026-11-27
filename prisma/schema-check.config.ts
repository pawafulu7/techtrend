import { defineConfig } from 'prisma/config';
import {
  checkShadowUrl,
  validateCheckTarget,
} from '../lib/database/schema-integrity';
import { SHADOW_DB_INIT_SQL } from '../scripts/db/shadow-db-init';

// Only check-schema's child process supplies this generated URL. Normal migration config is unchanged.
const target = validateCheckTarget(
  process.env.DATABASE_URL ?? '',
  process.env.NODE_ENV
);
const shadow = new URL(process.env.SCHEMA_CHECK_SHADOW_DATABASE_URL ?? '');
if (
  shadow.toString() !==
  checkShadowUrl(target, decodeURIComponent(shadow.pathname.slice(1)))
) {
  throw new Error(
    'Schema checks require the generated shadow on the same local server'
  );
}

export default defineConfig({
  // initShadowDb を使うのに要る。外部の表（tables.external）は登録しないので、ほかの動きは変わらない
  experimental: { externalTables: true },
  schema: 'schema.prisma',
  // migrate diff --from-migrations のシャドウ DB に、マイグレーションの記録の表を先に作る（scripts/db/shadow-db-init.ts）
  migrations: { path: 'migrations', initShadowDb: SHADOW_DB_INIT_SQL },
  datasource: { url: target.toString(), shadowDatabaseUrl: shadow.toString() },
});
