import 'dotenv/config';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  SCHEMA_ARTIFACT_SQL,
  DUPLICATE_INDEX_SQL,
} from '@/lib/database/schema-catalog';
import {
  bootstrapExtensionExtras,
  checkShadowUrl,
  compareArtifacts,
  isExpectedPrismaDiff,
  requiredIndexErrors,
  SHADOW_NAME_PATTERN,
  validateCheckTarget,
  type SchemaArtifact,
} from '@/lib/database/schema-integrity';

const exec = promisify(execFile);
const project = path.resolve(__dirname, '../..');
const cli = path.join(
  path.dirname(require.resolve('prisma/package.json')),
  'build/index.js'
);

/** Do not expose credentials or arbitrary server error messages in terminal/CI logs. */
function safeMessage(error: unknown): string {
  return (
    error instanceof Error ? error.message : 'Schema check failed'
  ).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database URL redacted]');
}

async function main() {
  const target = validateCheckTarget(
    process.env.DATABASE_URL ?? '',
    process.env.NODE_ENV
  );
  const shadowName = `techtrend_schema_check_${randomBytes(8).toString('hex')}_test`;
  const shadowUrl = checkShadowUrl(target, shadowName);
  const client = (url: string) =>
    new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url,
        max: 1,
        connectionTimeoutMillis: 5000,
      }),
      log: [],
    });
  const db = client(target.toString());
  let shadow: PrismaClient | undefined;
  let owned = false;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const childEnv = {
    ...process.env,
    DATABASE_URL: target.toString(),
    SCHEMA_CHECK_SHADOW_DATABASE_URL: shadowUrl,
  };
  async function prisma(args: string[]) {
    try {
      const result = await exec(process.execPath, [cli, ...args], {
        cwd: project,
        env: childEnv,
        signal: abort.signal,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return { code: 0, sql: result.stdout };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 2 &&
        'stdout' in error &&
        typeof error.stdout === 'string'
      )
        return { code: 2, sql: error.stdout };
      throw new Error(
        `Prisma ${args[1]} failed; check connection, replay privileges, and migration status`
      );
    }
  }
  try {
    // Creating, rather than resetting, a random new name proves this invocation owns cleanup.
    await db.$executeRawUnsafe(`CREATE DATABASE "${shadowName}"`);
    owned = true;
    console.log(`Owned shadow: ${shadowName}`);
    abort.signal.throwIfAborted();
    const status = await prisma(['migrate', 'status']);
    if (status.code !== 0) throw new Error('Pending or failed migrations');
    const history = await prisma([
      'migrate',
      'diff',
      '--from-migrations',
      'prisma/migrations',
      '--to-config-datasource',
      '--config',
      'prisma/schema-check.config.ts',
      '--script',
      '--exit-code',
    ]);
    if (history.code !== 0)
      throw new Error('Migration-backed database schema has drift');
    console.log('PASS migration status and migration-backed diff (exit 0)');
    shadow = client(shadowUrl);
    const [expected, actual, duplicates] = await Promise.all([
      shadow.$queryRawUnsafe<SchemaArtifact[]>(SCHEMA_ARTIFACT_SQL),
      db.$queryRawUnsafe<SchemaArtifact[]>(SCHEMA_ARTIFACT_SQL),
      db.$queryRawUnsafe<{ table_name: string; names: string[] }[]>(
        DUPLICATE_INDEX_SQL
      ),
    ]);
    const bootstrapExtras = bootstrapExtensionExtras(expected, actual);
    for (const row of bootstrapExtras)
      console.log(`INFO bootstrap-only extension: ${row.name}`);
    const errors = [
      ...compareArtifacts(
        expected,
        actual.filter((row) => !bootstrapExtras.includes(row))
      ),
      ...requiredIndexErrors(actual),
      ...duplicates.map(
        (row) =>
          `Duplicate indexes on ${row.table_name}: ${row.names.join(', ')}`
      ),
    ];
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      `PASS physical SQL definitions (${actual.length} artifacts), required UNIQUE/HNSW indexes, and no Article/Tag/Session duplicates`
    );
    abort.signal.throwIfAborted();
    const managed = await prisma([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
      '--exit-code',
    ]);
    if (!isExpectedPrismaDiff(managed.sql, managed.code))
      throw new Error('Unexpected Prisma-managed schema drift');
    console.log(
      'PASS Prisma-managed definitions; the known HNSW PSL omission is verified by physical comparison'
    );
  } finally {
    try {
      await shadow?.$disconnect();
    } finally {
      try {
        if (owned && SHADOW_NAME_PATTERN.test(shadowName)) {
          await db.$executeRawUnsafe(
            `DROP DATABASE "${shadowName}" WITH (FORCE)`
          );
          console.log(`Cleaned owned shadow: ${shadowName}`);
        }
      } finally {
        await db.$disconnect();
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
