import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

async function verifyConnectionPooling() {
  console.log('='.repeat(70));
  console.log('Neon Connection Pooling Verification');
  console.log('='.repeat(70));

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('\n❌ ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log(`\nDatabase URL: ${maskPassword(databaseUrl)}`);

  // Check if pooling is enabled (Neon-specific patterns)
  const isPoolingEnabled =
    databaseUrl.includes('pgbouncer=true') ||  // Query parameter method
    databaseUrl.includes('-pooler.') ||         // Neon pooler subdomain
    databaseUrl.includes(':6543');              // PgBouncer port

  console.log('\nConnection Pooling Status:');

  if (isPoolingEnabled) {
    console.log('✅ Connection pooling is ENABLED');

    if (databaseUrl.includes('pgbouncer=true')) {
      console.log('   Method: Query parameter (pgbouncer=true)');
    }
    if (databaseUrl.includes('-pooler.')) {
      console.log('   Method: Neon pooler subdomain');
    }
    if (databaseUrl.includes(':6543')) {
      console.log('   Method: PgBouncer port (6543)');
    }

    console.log('\n✅ RECOMMENDED for Vercel serverless environment');
  } else {
    console.log('⚠️  Connection pooling is NOT enabled');
    console.log('\n⚠️  WARNING: Direct connections may cause issues on Vercel');
    console.log('\nRecommended DATABASE_URL formats for Neon:');
    console.log('  1. With pgbouncer parameter:');
    console.log('     postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?pgbouncer=true');
    console.log('  2. With pooler subdomain:');
    console.log('     postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db');
  }

  // Test database connection
  console.log('\nTesting database connection...');

  try {
    const result = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT version();
    `;

    console.log('✅ Database connection successful');
    console.log(`   PostgreSQL version: ${result[0].version.split(' ')[1]}`);

    // Check current connection count
    const connections = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database();
    `;

    console.log(`   Active connections: ${connections[0].count}`);

    // Check connection limits
    const limits = await prisma.$queryRaw<Array<{
      max_connections: string;
      current_connections: bigint;
    }>>`
      SELECT
        current_setting('max_connections') as max_connections,
        (SELECT COUNT(*) FROM pg_stat_activity) as current_connections;
    `;

    console.log(`   Max connections: ${limits[0].max_connections}`);
    console.log(`   Current total connections: ${limits[0].current_connections}`);

    const usage = (Number(limits[0].current_connections) / Number(limits[0].max_connections)) * 100;
    console.log(`   Connection pool usage: ${usage.toFixed(1)}%`);

    if (usage > 80) {
      console.log('   ⚠️  WARNING: Connection pool usage is high (>80%)');
    }

  } catch (error) {
    console.error('\n❌ Database connection failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '='.repeat(70));

  if (isPoolingEnabled) {
    console.log('✅ All connection pooling checks PASSED');
    console.log('='.repeat(70));
    console.log('\n✅ Ready for Vercel serverless deployment');
  } else {
    console.log('⚠️  Connection pooling checks PASSED with warnings');
    console.log('='.repeat(70));
    console.log('\n⚠️  Configure pooling before deploying to Vercel');
  }
}

function maskPassword(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@]+)@/, ':***@'); // Fallback regex
  }
}

verifyConnectionPooling();
