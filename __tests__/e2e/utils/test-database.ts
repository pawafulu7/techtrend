import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as dotenv from 'dotenv';
import * as _path from '_path';

// Load test environment variables
dotenv.config({ path: '.env.test' });

/**
 * テストデータベースをセットアップする
 * - マイグレーションの実行
 * - テストデータの投入
 */
export async function setupTestDatabase() {
  try {
    console.error('Setting up test database...');
    // Normalize ports and env
    const pgPort = process.env.PG_TEST_PORT || '5543';
    const redisPort = process.env.REDIS_TEST_PORT || '6381';
    process.env.PG_TEST_PORT = pgPort;
    process.env.REDIS_TEST_PORT = redisPort;
    if (process.env.DATABASE_URL) {
      const replaced = process.env.DATABASE_URL.replace(/@localhost:\d+/, `@localhost:${pgPort}`);
      process.env.DATABASE_URL = replaced;
    }
    
    // Ensure test containers are running
    console.error('Starting test containers...');
    execSync('docker compose -p techtrend_codex_test -f docker-compose.test.yml up -d', {
      stdio: 'inherit',
      env: process.env,
    });
    
    // Wait for PostgreSQL to be ready
    console.error('Waiting for PostgreSQL to be ready...');
    let retries = 30;
    while (retries > 0) {
      try {
        execSync('docker compose -p techtrend_codex_test -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres', { stdio: 'ignore', env: process.env });
        break;
      } catch (e) {
        retries--;
        if (retries === 0) {
          throw new Error('PostgreSQL test container failed to start');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Run migrations
    console.error('Running migrations (deploy if present)...');
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      });
    } catch (_) {
      // Ignore migrate errors in ephemeral test DBs; we'll force sync schema next
    }
    console.error('Syncing schema with prisma db push...');
    try {
      execSync('npx prisma db push', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      });
    } catch (e) {
      console.error('db push failed; attempting reset + push', e instanceof Error ? e.message : e);
      try {
        execSync('npx prisma migrate reset --force --skip-seed', {
          stdio: 'inherit',
          env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        });
      } catch (_) {
        // ignore
      }
      execSync('npx prisma db push', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      });
    }
    
    // Seed test data
    console.error('Seeding test data...');
    execSync('npx tsx prisma/seed-test.ts', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    });
    
    console.error('Test database setup completed successfully!');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

/**
 * テストデータベースをクリーンアップする
 * - テスト終了後のクリーンアップ処理
 */
export async function teardownTestDatabase() {
  try {
    console.error('Cleaning up test database...');
    
    // Optionally stop containers if in CI environment
    if (process.env.CI) {
      execSync('docker compose -p techtrend_codex_test -f docker-compose.test.yml down -v', {
        stdio: 'inherit',
        env: process.env,
      });
    }
    
    console.error('Test database cleanup completed!');
  } catch (error) {
    console.error('Failed to cleanup test database:', error);
    // Don't throw in teardown to avoid masking test failures
  }
}

/**
 * テストデータベースをリセットする
 * - データを完全にクリアして再投入
 */
export async function resetTestDatabase() {
  try {
    console.error('Resetting test database...');
    
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    });
    
    // Re-seed with test data
    await setupTestDatabase();
    
    console.error('Test database reset completed!');
  } catch (error) {
    console.error('Failed to reset test database:', error);
    throw error;
  }
}
