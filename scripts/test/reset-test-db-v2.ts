#!/usr/bin/env npx tsx
/**
 * テスト環境データベースのリセットスクリプト（改良版）
 *
 * Prisma migrate resetを使わず、安全にDBをリセットします。
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

// .env.testファイルを読み込み（存在する場合）
const envPath = path.resolve(__dirname, '../../.env.test');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.testがない場合は通常の.envを使用
}

// データベースURL処理ユーティリティ
function parseDbUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      dbName: u.pathname.replace(/^\//, '') || 'techtrend_test',
      dbUser: u.username || 'postgres',
      dbPass: u.password || '',
      dbHost: u.hostname || 'localhost',
      dbPort: u.port || '5432'
    };
  } catch {
    // URLパースエラーの場合はデフォルト値を返す
    return {
      dbName: 'techtrend_test',
      dbUser: 'postgres',
      dbPass: 'postgres_dev_password',
      dbHost: 'localhost',
      dbPort: '5434'
    };
  }
}

// URLのパスワードをマスクする関数
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) {
      u.password = '****';
    }
    return u.toString();
  } catch {
    // URLパースに失敗した場合は正規表現でマスク
    return url.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/i, '$1****@');
  }
}

// テストDBのURL（環境変数から取得、またはデフォルト値）
const TEST_DB_URL = process.env.TEST_DATABASE_URL ||
                    process.env.TEST_DATABASE_URL_HOST ||
                    'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test';

const { dbName, dbUser, dbPass } = parseDbUrl(TEST_DB_URL);

async function resetTestDatabase() {
  console.log('🔄 テスト環境データベースのリセットを開始します...');
  console.log(`📍 接続先: ${maskUrl(TEST_DB_URL)}`);

  try {
    // 1. スキーマを再作成してDBを完全にクリーンにする
    console.log('📋 データベースをクリーンアップ中...');

    const resetSQL = `
      -- Drop the schema cascade (this will drop all tables, indexes, etc.)
      DROP SCHEMA IF EXISTS public CASCADE;

      -- Recreate the schema
      CREATE SCHEMA public;

      -- Grant permissions
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `;

    // PostgreSQLに直接接続してリセットを実行
    execSync(`echo '${resetSQL}' | docker exec -i techtrend-postgres-test psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName}`, {
      stdio: 'pipe', // NOTICEメッセージを抑制
      env: {
        ...process.env,
        PGPASSWORD: dbPass
      }
    });

    console.log('✅ データベースクリーンアップ完了');

    // 2. テーブルが確実に削除されたことを確認
    console.log('📋 テーブル削除を確認中...');

    execSync(`echo '\\dt' | docker exec -i techtrend-postgres-test psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        PGPASSWORD: dbPass
      }
    });

    // 3. マイグレーションを適用
    console.log('🔄 マイグレーションを適用中...');

    execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DB_URL
      }
    });

    console.log('✅ マイグレーション適用完了');

    // 4. テスト用シードデータを投入（オプション）
    if (process.argv.includes('--seed')) {
      console.log('🌱 テスト用シードデータを投入中...');
      execSync(`DATABASE_URL="${TEST_DB_URL}" npx tsx prisma/seed-test.ts`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: TEST_DB_URL
        }
      });
      console.log('✅ シードデータ投入完了');
    }

    console.log('🎉 テスト環境データベースのリセットが完了しました！');
    console.log('💡 ヒント: --seed オプションを付けるとテストデータも投入されます');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン処理を実行
resetTestDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});