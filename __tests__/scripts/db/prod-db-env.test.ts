/**
 * scripts/db/prod-db-env.sh の load_prod_database_url が、ポートの無い URL に 5432 を補うこと
 *
 * Ubuntu の psql / pg_dump はポートの無い URL に手元のクラスタのポートを当てはめ、
 * 本番に繋がらずにタイムアウトする。bash で関数を呼び、整えた後の URL を確かめる
 */
import { execFileSync } from 'child_process';

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
    ['複数ホストの URL', 'postgresql://u:p@db1.example.com,db2.example.com/app'],
    ['スキームの無い文字列', 'host=db.example.com dbname=app'],
  ])('%s は変えない', (_name, input) => {
    expect(load(input)).toBe(input);
  });
});
