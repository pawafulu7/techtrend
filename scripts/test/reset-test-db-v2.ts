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

// テストDBのURL（環境変数から取得、またはデフォルト値）
const TEST_DB_URL = process.env.TEST_DATABASE_URL ||
                    process.env.TEST_DATABASE_URL_HOST ||
                    'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test';

async function resetTestDatabase() {
  console.log('🔄 テスト環境データベースのリセットを開始します...');
  console.log(`📍 接続先: ${TEST_DB_URL}`);

  try {
    // 1. スキーマを再作成してDBを完全にクリーンにする
    console.log('🗑️ データベースを完全にクリアしています...');

    const resetSQL = `
      -- 既存のスキーマを削除して再作成
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `;

    execSync(`echo '${resetSQL}' | docker exec -i techtrend-postgres psql -U postgres -d techtrend_test`, {
      stdio: 'pipe' // NOTICEメッセージを抑制
    });

    console.log('✅ データベースクリア完了');

    // 2. Prismaマイグレーションを適用
    console.log('📦 マイグレーションを適用中...');

    execSync(`npx prisma migrate deploy`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DB_URL
      }
    });

    console.log('✅ マイグレーション適用完了');

    // 3. テスト用シードデータを投入（オプション）
    if (process.argv.includes('--seed')) {
      console.log('🌱 テスト用シードデータを投入中...');

      const seedFile = path.resolve(__dirname, '../../prisma/seed-test.ts');
      const seedFileExists = require('fs').existsSync(seedFile);

      if (seedFileExists) {
        execSync(`npx tsx ${seedFile}`, {
          stdio: 'inherit',
          env: {
            ...process.env,
            DATABASE_URL: TEST_DB_URL
          }
        });
        console.log('✅ シードデータ投入完了');
      } else {
        console.log('⚠️ seed-test.tsファイルが見つかりません。スキップします。');
      }
    }

    // 4. テーブル一覧を表示（確認用）
    console.log('\n📊 作成されたテーブル:');
    execSync(`echo '\\dt' | docker exec -i techtrend-postgres psql -U postgres -d techtrend_test`, {
      stdio: 'inherit'
    });

    console.log('\n🎉 テスト環境データベースのリセットが完了しました！');

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