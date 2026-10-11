/**
 * scripts/db/prod-db-env.sh の関数を bash で呼んで確かめる
 * - load_prod_database_url が、ポートの無い URL に 5432 を補うこと
 * - URL からパスワードを取り出して復号すること、本番に接続するコマンドの生の出力を表示しないこと
 *
 * Ubuntu の psql / pg_dump はポートの無い URL に手元のクラスタのポートを当てはめ、
 * 本番に繋がらずにタイムアウトする。bash で関数を呼び、整えた後の URL を確かめる
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// リポジトリの直下からの相対パス（テストは直下で動く）。環境から作ったパスをシェルに渡さない
const SCRIPT = './scripts/db/prod-db-env.sh';

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
      'パスワードにエンコードした @ と : を含んでもホスト部だけを見る',
      'postgresql://user:p%40ss%3Aw%40rd@db.example.com/app',
      'postgresql://user:p%40ss%3Aw%40rd@db.example.com:5432/app',
    ],
    ['IPv6 のホストにも補う', 'postgresql://u:p@[::1]/app', 'postgresql://u:p@[::1]:5432/app'],
    ['空のポート（host:）に補う', 'postgresql://u:p@db.example.com:/app', 'postgresql://u:p@db.example.com:5432/app'],
    ['IPv6 の空のポート（[::1]:）に補う', 'postgresql://u:p@[::1]:/app', 'postgresql://u:p@[::1]:5432/app'],
  ])('%s', (_name, input, expected) => {
    expect(load(input)).toBe(expected);
  });

  it.each([
    ['ポートがある URL', 'postgresql://user:pass@db.example.com:6543/app?sslmode=require'],
    ['ポートがある IPv6 の URL', 'postgresql://u:p@[::1]:5433/app'],
    ['ホストが空の URL（UNIX ソケット）', 'postgresql:///app?host=/var/run/postgresql'],
    ['複数ホストの URL', 'postgresql://u:p@db1.example.com,db2.example.com/app'],
    ['スキームの無い文字列', 'host=db.example.com dbname=app'],
  ])('%s は変えない', (_name, input) => {
    expect(load(input)).toBe(input);
  });
});

// 関数を bash で呼ぶ。引数は $2 以降で渡し、シェルの文字列に埋め込まない
function call(snippet: string, args: string[] = [], env: Record<string, string> = {}, input = '') {
  return spawnSync('bash', ['-c', `source "$1" && shift && ${snippet}`, '_', SCRIPT, ...args], {
    env: { PATH: process.env.PATH, ...env },
    input,
    encoding: 'utf8',
  });
}

describe('prod_db_url_password / prod_db_url_without_password', () => {
  it.each([
    ['%XX を復号する', 'postgresql://user:p%40ss%3Aw%25rd@db.example.com/app', 'p@ss:w%rd'],
    ['+ は空白にしない（libpq と同じ）', 'postgresql://user:a+b@db.example.com/app', 'a+b'],
    ['末尾の %0A も改行に戻す', 'postgresql://user:p%0A@db.example.com/app', 'p\n'],
    ['エンコードされていない値はそのまま', 'postgresql://user:plain@db.example.com:5432/app?sslmode=require', 'plain'],
    ['パスワードが無ければ空', 'postgresql://user@db.example.com/app', ''],
    ['認証情報が無ければ空', 'postgresql://db.example.com/app', ''],
  ])('パスワード: %s', (_name, url, expected) => {
    expect(call('prod_db_url_password "$1"', [url]).stdout).toBe(expected);
  });

  it.each([
    ['postgresql://user:p%40ss@db.example.com:5432/app?sslmode=require', 'postgresql://user@db.example.com:5432/app?sslmode=require'],
    ['postgresql://user@db.example.com/app', 'postgresql://user@db.example.com/app'],
    ['postgresql://db.example.com/app', 'postgresql://db.example.com/app'],
  ])('パスワードを除く: %s', (url, expected) => {
    expect(call('prod_db_url_without_password "$1"', [url]).stdout).toBe(expected);
  });
});

describe('prod_db_filter_output', () => {
  const filter = (input: string) => call('prod_db_filter_output', [], {}, input).stdout;

  it('名前=数値・マイグレーション名・Prisma の定型文だけを通す', () => {
    const input = [
      'Prisma schema loaded from prisma/schema.prisma',
      'Datasource "db": PostgreSQL database "app", schema "public" at "db.example.com:5432"',
      '',
      '3 migrations found in prisma/migrations',
      'Following migration have not yet been applied:',
      '20261011000002_reject_partial_article_trgm_search_indexes',
      '  └─ 20261011000003_add_index/',
      '20250921_baseline',
      '20251012_105500_add_user_deleted_at',
      'articles=42',
      'ratio=0.5',
      'exists=true',
      "Error: P1001: Can't reach database server at `db.example.com:5432`",
      'connect ECONNREFUSED 192.0.2.1:5432',
      'postgresql://user:pass@db.example.com/app',
      'db.example.com:5432=1',
      'name=db.example.com',
    ].join('\n');

    expect(filter(input)).toBe(
      [
        '3 migrations found in prisma/migrations',
        'Following migration have not yet been applied:',
        '20261011000002_reject_partial_article_trgm_search_indexes',
        '20261011000003_add_index/',
        '20250921_baseline',
        '20251012_105500_add_user_deleted_at',
        'articles=42',
        'ratio=0.5',
        'exists=true',
        '',
      ].join('\n')
    );
  });
});

describe('prod_db_run', () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'prod-db-run-'));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('生の出力を表示せずに保存し、許可した行と成否だけを出す', () => {
    const result = call(
      'prod_db_run bash -c "$1"',
      ['echo "connecting to db.example.com"; echo "articles=3"; echo "host db.example.com" >&2'],
      { PROD_DB_LOG_DIR: logDir }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('articles=3\n');
    expect(result.stderr).toMatch(/^\[prod-db\] 成功 \(exit 0\)。出力 3 行（表示 1 行）。生の出力: /);
    expect(`${result.stdout}${result.stderr}`).not.toContain('db.example.com');

    const logs = readdirSync(logDir);
    expect(logs).toHaveLength(1);
    const log = join(logDir, logs[0]);
    expect(statSync(log).mode & 0o777).toBe(0o600);
    expect(readFileSync(log, 'utf8')).toContain('connecting to db.example.com');
  });

  it('失敗したら終了コードを返し、エラーコードだけを出す', () => {
    const result = call(
      'prod_db_run bash -c "$1"',
      ["echo \"Error: P1001: Can't reach database server at db.example.com:5432\" >&2; echo 'connect ECONNREFUSED 192.0.2.1:5432' >&2; exit 3"],
      { PROD_DB_LOG_DIR: logDir }
    );

    expect(result.status).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^\[prod-db\] 失敗 \(exit 3\)。エラーコード: ECONNREFUSED P1001。出力 2 行（表示 0 行）/);
    expect(result.stderr).not.toContain('db.example.com');
    expect(result.stderr).not.toContain('192.0.2.1');
  });

  it('set -euo pipefail の下でも、出力の無い失敗で途中で止まらずに成否を出し、終了コードを返す', () => {
    // with-prod-db.sh と同じく set -e の下で呼ぶ（|| を付けると関数の中で set -e が効かず確かめられない）
    const result = call('set -euo pipefail; prod_db_run bash -c "exit 5"; echo unreachable', [], {
      PROD_DB_LOG_DIR: logDir,
    });

    expect(result.status).toBe(5);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^\[prod-db\] 失敗 \(exit 5\)。出力 0 行（表示 0 行）/);
  });
});
