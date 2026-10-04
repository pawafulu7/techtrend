/** Prisma cannot describe HNSW, expression/partial indexes, triggers and CHECKs completely. */
export interface SchemaArtifact {
  kind: string;
  name: string;
  details: Record<string, unknown>;
}

/** Compare physical definitions, including invalid/disabled objects, without printing their contents. */
export function compareArtifacts(
  expected: SchemaArtifact[],
  actual: SchemaArtifact[]
): string[] {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)])
      );
    }
    return value;
  };
  const map = (rows: SchemaArtifact[]) =>
    new Map(
      rows.map((row) => [
        `${row.kind}:${row.name}`,
        JSON.stringify(canonical(row.details)),
      ])
    );
  const wanted = map(expected);
  const found = map(actual);
  const errors: string[] = [];
  for (const [key, definition] of wanted) {
    if (!found.has(key)) errors.push(`Missing ${key}`);
    else if (found.get(key) !== definition) errors.push(`Changed ${key}`);
  }
  for (const key of found.keys())
    if (!wanted.has(key)) errors.push(`Unexpected ${key}`);
  return errors;
}

/** Docker bootstrap installs unaccent independently of app migrations; report that optional extra. */
export function bootstrapExtensionExtras(
  expected: SchemaArtifact[],
  actual: SchemaArtifact[]
): SchemaArtifact[] {
  return actual.filter(
    (row) =>
      row.kind === 'extension' &&
      row.name === 'unaccent' &&
      row.details.schema === 'public' &&
      typeof row.details.version === 'string' &&
      row.details.version.length > 0 &&
      !expected.some(
        (item) => item.kind === 'extension' && item.name === row.name
      )
  );
}

/** Fail closed: only this entire, known PSL omission may remain; never discard arbitrary DDL. */
export function isExpectedPrismaDiff(sql: string, exitCode: number): boolean {
  const ddl = sql
    .replace(/^\s*--[^\r\n]*$/gm, '')
    .trim()
    .replace(/\s+/g, ' ');
  return (
    (exitCode === 0 && ddl === '') ||
    (exitCode === 2 &&
      /^DROP INDEX (?:"public"\.)?"idx_article_chunk_embedding_hnsw_cosine";$/.test(
        ddl
      ))
  );
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'postgres',
  'postgres-test',
  'techtrend-postgres',
  'techtrend-postgres-test',
]);
export const SHADOW_NAME_PATTERN = /^techtrend_schema_check_[a-f0-9]{16}_test$/;

/** The checker is for local development/test databases, never a production server. */
export function validateCheckTarget(value: string, nodeEnv?: string): URL {
  if (nodeEnv === 'production')
    throw new Error('Schema checks cannot run in production mode');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid database URL');
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !LOCAL_HOSTS.has(url.hostname.toLowerCase()) ||
    !(name === 'techtrend_dev' || name.endsWith('_test')) ||
    SHADOW_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      'Schema checks require a local techtrend_dev or *_test database'
    );
  }
  if (
    url.searchParams.has('schema') &&
    url.searchParams.get('schema') !== 'public'
  )
    throw new Error('Only the public schema is supported');
  // pg's connection-string parser can override URL host/database using query parameters.
  const routingOverrides = new Set([
    'host',
    'hostaddr',
    'port',
    'database',
    'dbname',
    'user',
    'password',
    'options',
  ]);
  if (
    [...url.searchParams.keys()].some((key) =>
      routingOverrides.has(key.toLowerCase())
    )
  ) {
    throw new Error('Database connection overrides are not allowed');
  }
  return url;
}

/** Construct a separate generated shadow URL; never accept an existing user-selected database. */
export function checkShadowUrl(target: URL, shadowName: string): string {
  if (
    !SHADOW_NAME_PATTERN.test(shadowName) ||
    decodeURIComponent(target.pathname.slice(1)) === shadowName
  )
    throw new Error('Invalid owned shadow database');
  const shadow = new URL(target.toString());
  shadow.pathname = `/${shadowName}`;
  return shadow.toString();
}

/** Required business invariants still hold even if someone edits the migration history itself. */
export function requiredIndexErrors(rows: SchemaArtifact[]): string[] {
  const indexes = new Map(
    rows
      .filter((row) => row.kind === 'index')
      .map((row) => [row.name, row.details])
  );
  const required = [
    ['Tag_name_key', 'Tag', 'btree', true, ['name'], null],
    ['Tag_name_lower_key', 'Tag', 'btree', true, ['lower(name)'], null],
    [
      'uq_user_source_preset_name',
      'UserSourcePreset',
      'btree',
      true,
      ['userId', 'lower((name)::text)'],
      null,
    ],
    ['Session_token_key', 'Session', 'btree', true, ['token'], null],
    [
      'idx_article_chunk_embedding_hnsw_cosine',
      'ArticleChunk',
      'hnsw',
      false,
      ['embedding'],
      null,
    ],
    [
      'idx_article_embedding_hnsw_summary',
      'ArticleEmbedding',
      'hnsw',
      false,
      ['embedding'],
      "(embeddingKey = 'summary'::EmbeddingKey)",
    ],
  ] as const;
  const normalize = (value: string) =>
    value.replace(/"/g, '').replace(/\s+/g, ' ').trim();
  const errors: string[] = [];
  for (const [name, table, method, unique, keys, predicate] of required) {
    const row = indexes.get(name);
    if (
      !row ||
      row.table !== table ||
      row.method !== method ||
      row.unique !== unique ||
      row.valid !== true ||
      row.ready !== true ||
      row.primary !== false ||
      row.keyCount !== row.columnCount ||
      !Array.isArray(row.keys) ||
      JSON.stringify(
        row.keys.map((key) => (typeof key === 'string' ? normalize(key) : key))
      ) !== JSON.stringify(keys) ||
      (typeof row.predicate === 'string'
        ? normalize(row.predicate)
        : row.predicate) !== predicate
    ) {
      errors.push(`Invalid required index:${name}`);
    } else if (
      method === 'hnsw' &&
      (JSON.stringify(row.options) !==
        JSON.stringify(['ef_construction=64', 'm=16']) ||
        JSON.stringify(row.opclasses) !==
          JSON.stringify(['public.vector_cosine_ops']))
    )
      errors.push(`Invalid HNSW parameters:${name}`);
  }
  if (indexes.has('idx_session_token'))
    errors.push('Redundant index:idx_session_token');
  return errors;
}
