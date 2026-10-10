/**
 * @jest-environment node
 *
 * マイグレーションの関数に、拡張の設定（hnsw.ef_search のように名前に点を含む設定）を SET で
 * 書いていないことを確かめる。
 *
 * スーパーユーザーでないロール（本番の neondb_owner）は、その接続で読み込まれていない拡張の
 * 設定を関数に保存できず、「permission denied to set parameter」でマイグレーションが失敗する。
 * 開発・テストの DB はスーパーユーザーで動くので、DB のテストでは捕まらない
 * （20261010150000 が本番のデプロイで失敗した）。拡張の設定は関数の本文で set_config で掛ける。
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');

/**
 * 本番で失敗し、何もしなかったマイグレーション。履歴に残るので消せない
 * （20261010180000_fix_related_articles_knn_function_settings が作り直した）
 */
const KNOWN_FAILED = new Set([
  '20261010150000_add_related_articles_knn_function',
]);

/** 関数定義の SET 句のうち、名前に点を含む設定（拡張の設定）を拾う（RESET は拾わない） */
const EXTENSION_SETTING_IN_SET =
  /\bSET\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*(?:=|TO\b)/gi;

/**
 * CREATE [OR REPLACE] FUNCTION の定義。属性は本文（AS $tag$ ... $tag$）の前にも後ろにも書けるので、
 * 本文の前（1）と、本文を閉じてからセミコロンまで（3）を検査する。タグは数字を含められる（$body1$）
 */
const FUNCTION_DEFINITION =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION([\s\S]*?)\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\2([^;]*);/gi;

function extensionSettingsInFunctionSet(sql: string): string[] {
  const found: string[] = [];
  for (const match of sql.matchAll(FUNCTION_DEFINITION)) {
    for (const attributes of [match[1], match[3]]) {
      for (const setting of attributes.matchAll(EXTENSION_SETTING_IN_SET)) {
        found.push(setting[1]);
      }
    }
  }
  return found;
}

describe('マイグレーションの関数の設定', () => {
  it('検出: 関数の SET に書いた拡張の設定を拾い、本体の設定や本文の set_config は拾わない', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql
      SET enable_seqscan = off
      SET hnsw.ef_search = 100
      SET ivfflat.probes TO 10
      AS $$
      BEGIN
        PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
      END;
      $$;
    `;

    expect(extensionSettingsInFunctionSet(sql)).toEqual([
      'hnsw.ef_search',
      'ivfflat.probes',
    ]);
  });

  it('検出: 本文の後ろに書いた SET と、数字を含むドル引用のタグも扱う', () => {
    const sql = `
      CREATE FUNCTION g() RETURNS void AS $body1$
      BEGIN
        RAISE NOTICE 'x;y';
        PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
      END;
      $body1$ LANGUAGE plpgsql SET hnsw.ef_search = 100 SET enable_sort = off;
    `;

    expect(extensionSettingsInFunctionSet(sql)).toEqual(['hnsw.ef_search']);
  });

  it('関数の外の SET（マイグレーション中のセッション設定）は対象外', () => {
    expect(
      extensionSettingsInFunctionSet('SET hnsw.ef_search = 100;\nSELECT 1;')
    ).toEqual([]);
  });

  it('どのマイグレーションの関数も、拡張の設定を SET に書いていない', () => {
    const offenders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !KNOWN_FAILED.has(entry.name))
      .flatMap((entry) => {
        const file = path.join(MIGRATIONS_DIR, entry.name, 'migration.sql');
        let sql: string;
        try {
          sql = readFileSync(file, 'utf8');
        } catch {
          return [];
        }
        return extensionSettingsInFunctionSet(sql).map(
          (setting) => `${entry.name}: ${setting}`
        );
      });

    expect(offenders).toEqual([]);
  });

  it('除外している失敗したマイグレーションは、実際に拡張の設定を SET に書いている（除外が要らなくなったら消す）', () => {
    for (const name of KNOWN_FAILED) {
      const sql = readFileSync(
        path.join(MIGRATIONS_DIR, name, 'migration.sql'),
        'utf8'
      );
      expect(extensionSettingsInFunctionSet(sql)).toContain('hnsw.ef_search');
    }
  });
});
