/**
 * scripts/db/prod-db-env.sh の load_prod_database_url が、ポートの無い URL に 5432 を補うこと
 *
 * Ubuntu の psql / pg_dump はポートの無い URL に手元のクラスタのポート（例: 5433）を当てはめ、
 * Neon に繋がらずにタイムアウトする。bash で関数を呼び、整えた後の URL を確かめる
 */
import { execFileSync, spawnSync } from 'child_process';
import path from 'path';

const SCRIPT = path.join(process.cwd(), 'scripts/db/prod-db-env.sh');

function load(url: string): string {
  return execFileSync(
    'bash',
    ['-c', 'source "$1" && load_prod_database_url && printf "%s" "$PROD_DATABASE_URL"', '_', SCRIPT],
    { env: { PATH: process.env.PATH, PROD_DATABASE_URL: url }, encoding: 'utf8' }
  );
}

describe('load_prod_database_url', () => {
  it.each([
    [
      'ポートの無いホストに 5432 を補う',
      'postgresql://user:pass@db.example.com/app?sslmode=require&channel_binding=require',
      'postgresql://user:pass@db.example.com:5432/app?sslmode=require&channel_binding=require',
    ],
    [
      'パスのない URL にも補う',
      'postgres://user:pass@db.example.com?sslmode=require',
      'postgres://user:pass@db.example.com:5432?sslmode=require',
    ],
    [
      '認証情報の無い URL にも補う',
      'postgresql://db.example.com/app',
      'postgresql://db.example.com:5432/app',
    ],
    [
      'パスワードの @ と : を含んでもホスト部だけを見る',
      'postgresql://user:p%40ss:w@rd@db.example.com/app',
      'postgresql://user:p%40ss:w@rd@db.example.com:5432/app',
    ],
    ['IPv6 のホストにも補う', 'postgresql://u:p@[::1]/app', 'postgresql://u:p@[::1]:5432/app'],
  ])('%s', (_name, input, expected) => {
    expect(load(input)).toBe(expected);
  });

  it.each([
    ['ポートがある URL', 'postgresql://user:pass@db.example.com:6543/app?sslmode=require'],
    ['ポートがある IPv6 の URL', 'postgresql://u:p@[::1]:5433/app'],
    ['ホストが空の URL（UNIX ソケット）', 'postgresql:///app?host=/var/run/postgresql'],
    ['スキームの無い文字列', 'host=db.example.com dbname=app'],
  ])('%s は変えない', (_name, input) => {
    expect(load(input)).toBe(input);
  });
});

/** source して PROD_DATABASE_URL を設定し、prod_db_run_masked でコマンドを流す。終了コードも返す */
function runMasked(url: string, command: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    'bash',
    ['-c', 'source "$1" && prod_db_run_masked sh -c "$2"', '_', SCRIPT, command],
    // .invalid は名前解決されないので、IP の伏せ方は環境に依らない
    { env: { PATH: process.env.PATH, PROD_DATABASE_URL: url }, encoding: 'utf8' }
  );
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe('prod_db_run_masked', () => {
  const URL = 'postgresql://app_owner:s3cret@prod-db.invalid:5432/appdb?sslmode=require';

  it('標準出力と標準エラーから、ホスト・ロール・DB 名を伏せ、終了コードを返す', () => {
    const result = runMasked(
      URL,
      'echo "at prod-db.invalid:5432 database appdb user app_owner"; echo "role app_owner on prod-db.invalid" >&2; exit 3'
    );

    expect(result.stdout).toBe('at <prod-db-host>:5432 database <prod-db-name> user <prod-db-user>\n');
    expect(result.stderr).toBe('role <prod-db-user> on <prod-db-host>\n');
    expect(result.status).toBe(3);
  });

  it('ホストの . は文字どおりに一致させる（ほかの文字列を伏せない）', () => {
    const result = runMasked('postgresql://u:p@10.0.0.1/appdb', 'echo "10.0.0.1 10a0b0c1"');

    expect(result.stdout).toBe('<prod-db-host> 10a0b0c1\n');
    expect(result.status).toBe(0);
  });
});
