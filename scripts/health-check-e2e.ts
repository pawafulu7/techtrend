import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

async function healthCheck() {
  const checks = {
    database: false,
    redis: false,
    server: false,
    seedData: false,
  };

  // DB接続チェック
  try {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres:postgres_dev_password@localhost:5433/techtrend_test'
        }
      }
    });
    const count = await prisma.article.count();
    checks.database = true;
    checks.seedData = count === 50;
    
    if (count !== 50) {
      console.error(`記事数が期待値と異なります: ${count}件 (期待値: 50件)`);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('DB接続エラー:', error);
  }

  // Redis接続チェック
  try {
    const redis = new Redis(6380);
    await redis.ping();
    checks.redis = true;
    redis.disconnect();
  } catch (error) {
    console.error('Redis接続エラー:', error);
  }

  // 開発サーバーチェック
  try {
    const response = await fetch('http://localhost:3000');
    checks.server = response.ok;
  } catch (error) {
    console.error('サーバー接続エラー:', error);
  }

  // 結果表示
  console.log('\nヘルスチェック結果:');
  console.log('  ' + (checks.database ? '✓' : '✗') + ' Database');
  console.log('  ' + (checks.redis ? '✓' : '✗') + ' Redis');
  console.log('  ' + (checks.server ? '✓' : '✗') + ' Server');
  console.log('  ' + (checks.seedData ? '✓' : '✗') + ' Seed Data (50件)');

  const allChecksPass = Object.values(checks).every(v => v);
  if (allChecksPass) {
    console.log('\n全てのチェックが成功しました');
  } else {
    console.log('\n一部のチェックが失敗しました');
  }

  return allChecksPass;
}

healthCheck().then(success => {
  process.exit(success ? 0 : 1);
});