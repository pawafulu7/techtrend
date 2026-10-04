import { defineConfig } from 'prisma/config';
import {
  checkShadowUrl,
  validateCheckTarget,
} from '../lib/database/schema-integrity';

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
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: target.toString(), shadowDatabaseUrl: shadow.toString() },
});
