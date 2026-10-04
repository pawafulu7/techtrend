import actualIndexes from './fixtures/schema-required-indexes.json';
import {
  bootstrapExtensionExtras,
  checkShadowUrl,
  compareArtifacts,
  isExpectedPrismaDiff,
  requiredIndexErrors,
  validateCheckTarget,
  type SchemaArtifact,
} from '@/lib/database/schema-integrity';

describe('schema integrity: fail-closed drift checks', () => {
  const known = 'DROP INDEX "idx_article_chunk_embedding_hnsw_cosine";';
  it('accepts only an empty successful diff or the entire known PSL omission', () => {
    expect(isExpectedPrismaDiff('-- This is an empty migration.\n', 0)).toBe(
      true
    );
    expect(isExpectedPrismaDiff(`-- DropIndex\n${known}`, 2)).toBe(true);
    expect(
      isExpectedPrismaDiff(
        'DROP INDEX "public"."idx_article_chunk_embedding_hnsw_cosine";',
        2
      )
    ).toBe(true);
    expect(isExpectedPrismaDiff('', 2)).toBe(false);
    expect(isExpectedPrismaDiff(known, 0)).toBe(false);
    expect(isExpectedPrismaDiff('', 1)).toBe(false);
    expect(isExpectedPrismaDiff(`${known}\nDROP TABLE "Tag";`, 2)).toBe(false);
    expect(
      isExpectedPrismaDiff(
        `-- ${known}\nALTER TABLE "Tag" ADD COLUMN x text;`,
        2
      )
    ).toBe(false);
  });

  it('rejects production/remote/schema-mismatched targets without exposing the URL', () => {
    expect(() =>
      validateCheckTarget(
        'postgresql://postgres:secret@localhost:5432/techtrend_dev'
      )
    ).not.toThrow();
    expect(() =>
      validateCheckTarget(
        'postgresql://postgres:secret@postgres-test:5432/techtrend_test',
        'test'
      )
    ).not.toThrow();
    for (const url of [
      'postgresql://postgres:secret@remote.example/techtrend_test',
      'postgresql://postgres:secret@localhost/techtrend_prod',
      'postgresql://postgres:secret@localhost/techtrend_dev?schema=other',
      'postgresql://postgres:secret@localhost/techtrend_dev?host=remote.example',
      'postgresql://postgres:secret@localhost/techtrend_dev?database=techtrend_prod',
      'postgresql://postgres:secret@localhost/techtrend_dev?options=-c%20search_path=other',
    ]) {
      expect(() => validateCheckTarget(url)).toThrow();
      try {
        validateCheckTarget(url);
      } catch (error) {
        expect((error as Error).message).not.toContain('secret');
      }
    }
    expect(() =>
      validateCheckTarget(
        'postgresql://postgres@localhost/techtrend_test',
        'production'
      )
    ).toThrow();
  });

  it('owns only generated names, with a distinct database on the same server', () => {
    const target = validateCheckTarget(
      'postgresql://postgres:secret@localhost:5432/techtrend_test?schema=public'
    );
    const shadow = new URL(
      checkShadowUrl(target, 'techtrend_schema_check_0123456789abcdef_test')
    );
    expect(shadow.host).toBe(target.host);
    expect(shadow.pathname).not.toBe(target.pathname);
    expect(shadow.search).toBe(target.search);
    for (const name of [
      'techtrend_test',
      'other_test',
      'techtrend_schema_check_x";DROP DATABASE foo;--_test',
    ])
      expect(() => checkShadowUrl(target, name)).toThrow();
  });

  it('detects nested changes, missing/extra artifacts, and whitespace changes in function literals', () => {
    const expected: SchemaArtifact[] = [
      {
        kind: 'index',
        name: 'expr',
        details: { keys: ['lower(name)'], valid: true },
      },
      {
        kind: 'function',
        name: 'f()',
        details: { definition: "SELECT 'a  b'" },
      },
    ];
    expect(
      compareArtifacts(expected, [
        { ...expected[0], details: { valid: true, keys: ['lower(name)'] } },
        expected[1],
      ])
    ).toEqual([]);
    expect(
      compareArtifacts(expected, [
        { ...expected[0], details: { keys: ['name'], valid: true } },
        { ...expected[1], details: { definition: "SELECT 'a b'" } },
      ])
    ).toEqual(['Changed index:expr', 'Changed function:f()']);
    expect(
      compareArtifacts(expected, [
        expected[1],
        { kind: 'trigger', name: 'unexpected', details: {} },
      ])
    ).toEqual(['Missing index:expr', 'Unexpected trigger:unexpected']);
  });

  it('requires valid UNIQUE/HNSW indexes even if replay itself also lacks them', () => {
    expect(requiredIndexErrors([])).toEqual(
      expect.arrayContaining([
        'Invalid required index:Tag_name_key',
        'Invalid required index:Tag_name_lower_key',
        'Invalid required index:uq_user_source_preset_name',
        'Invalid required index:idx_article_embedding_hnsw_summary',
      ])
    );
  });
  it('allows only the documented bootstrap extra without hiding changed managed extensions', () => {
    const extra: SchemaArtifact = {
      kind: 'extension',
      name: 'unaccent',
      details: { schema: 'public', version: '1.1' },
    };
    expect(bootstrapExtensionExtras([], [extra])).toEqual([extra]);
    expect(bootstrapExtensionExtras([extra], [extra])).toEqual([]);
    expect(
      bootstrapExtensionExtras([], [{ ...extra, name: 'unexpected' }])
    ).toEqual([]);
    expect(bootstrapExtensionExtras([], [{ ...extra, kind: 'index' }])).toEqual(
      []
    );
    expect(
      bootstrapExtensionExtras(
        [],
        [{ ...extra, details: { schema: 'other', version: '1.1' } }]
      )
    ).toEqual([]);
  });
  it('validates real PostgreSQL index representations and rejects changes to nested definitions', () => {
    const rows = actualIndexes as SchemaArtifact[];
    expect(requiredIndexErrors(rows)).toEqual([]);
    for (const patch of [
      { valid: false },
      { keys: ['name'] },
      { unique: false },
    ]) {
      const changed = rows.map((row) =>
        row.name === 'Tag_name_lower_key'
          ? { ...row, details: { ...row.details, ...patch } }
          : row
      );
      expect(requiredIndexErrors(changed)).toContain(
        'Invalid required index:Tag_name_lower_key'
      );
    }
    for (const patch of [
      { opclasses: ['public.vector_l2_ops'] },
      { options: ['ef_construction=32', 'm=16'] },
    ]) {
      const changed = rows.map((row) =>
        row.name === 'idx_article_chunk_embedding_hnsw_cosine'
          ? { ...row, details: { ...row.details, ...patch } }
          : row
      );
      expect(requiredIndexErrors(changed)).toContain(
        'Invalid HNSW parameters:idx_article_chunk_embedding_hnsw_cosine'
      );
    }
    const changed = rows.map((row) =>
      row.name === 'idx_article_embedding_hnsw_summary'
        ? { ...row, details: { ...row.details, predicate: null } }
        : row
    );
    expect(requiredIndexErrors(changed)).toContain(
      'Invalid required index:idx_article_embedding_hnsw_summary'
    );
  });
});
