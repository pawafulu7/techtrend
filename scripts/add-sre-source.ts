import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSRESource() {
  console.log('Adding SRE source...');

  try {
    const source = await prisma.source.create({
      data: {
        name: 'SRE',
        type: 'RSS',
        url: 'https://sreweekly.com/feed/', // 代表URLとして設定
        enabled: true,
      },
    });

    console.log(`✅ Created SRE source: ${source.name} (ID: ${source.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      console.log('ℹ️  SRE source already exists');
    } else {
      console.error('❌ Error creating SRE source:', error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addSRESource().catch(console.error);