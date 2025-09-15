#!/usr/bin/env npx tsx
/**
 * テスト環境データベースのリセットスクリプト
 *
 * このスクリプトは、テスト環境のデータベースを安全にリセットします。
 * 既存の制約やテーブルが存在する場合でも適切に処理します。
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// .env.testファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

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
      dbPort: '5433'
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

const TEST_DB_URL = process.env.TEST_DATABASE_URL ||
                    process.env.TEST_DATABASE_URL_HOST ||
                    'postgresql://postgres:postgres_dev_password@localhost:5433/techtrend_test';

const { dbName, dbUser, dbPass } = parseDbUrl(TEST_DB_URL);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DB_URL
    }
  }
});

async function resetTestDatabase() {
  console.log('🔄 テスト環境データベースのリセットを開始します...');
  console.log(`📍 接続先: ${maskUrl(TEST_DB_URL)}`);

  try {
    // 1. まず既存の接続を切断
    await prisma.$disconnect();

    // 2. データベースに直接接続して、問題のあるテーブルを事前にクリーンアップ
    console.log('📋 既存のテーブルと制約をクリーンアップ中...');

    const cleanupSQL = `
      -- Drop VerificationToken table and its constraints if they exist
      DROP TABLE IF EXISTS "VerificationToken" CASCADE;

      -- Drop ArticleView constraints if they exist
      ALTER TABLE "ArticleView" DROP CONSTRAINT IF EXISTS "ArticleView_articleId_fkey";
      ALTER TABLE "ArticleView" DROP CONSTRAINT IF EXISTS "ArticleView_userId_fkey";

      -- Drop indexes if they exist (from performance optimization migrations)
      DROP INDEX IF EXISTS "idx_article_title_gin";
      DROP INDEX IF EXISTS "idx_article_summary_gin";
      DROP INDEX IF EXISTS "idx_article_category";
      DROP INDEX IF EXISTS "idx_article_search_gin";
      DROP INDEX IF EXISTS "idx_article_tag_reverse";
    `;

    // PostgreSQLに直接接続してクリーンアップを実行
    execSync(`echo '${cleanupSQL}' | docker exec -i techtrend-postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName}`, {
      stdio: 'pipe', // NOTICEメッセージを抑制
      env: {
        ...process.env,
        PGPASSWORD: dbPass
      }
    });

    console.log('✅ クリーンアップ完了');

    // 3. データベースをリセット（migrate reset の代わりに直接操作）
    console.log('🔄 データベースをリセット中...');

    // 全テーブルを削除（CASCADE で依存関係も含めて）、_prisma_migrationsも含む
    const dropAllTablesSQL = `
      DO \\$\\$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables in public schema including _prisma_migrations for clean reset
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END \\$\\$;
    `;

    execSync(`echo "${dropAllTablesSQL}" | docker exec -i techtrend-postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        PGPASSWORD: dbPass
      }
    });

    console.log('✅ テーブル削除完了');

    // 4. マイグレーションを適用
    console.log('🔄 マイグレーションを適用中...');

    execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DB_URL
      }
    });

    console.log('✅ マイグレーション適用完了');

    // 5. テスト用シードデータを投入（オプション）
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

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理を実行
resetTestDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});