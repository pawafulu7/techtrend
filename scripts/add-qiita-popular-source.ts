import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addQiitaPopularSource() {
  console.log('Adding Qiita Popular source...');

  try {
    const source = await prisma.source.create({
      data: {
        name: 'Qiita Popular',
        type: 'RSS',
        url: 'https://qiita.com/popular-items/feed',
        enabled: true,
      },
    });

    console.log(`✅ Created source: ${source.name} (ID: ${source.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      console.log('ℹ️  Qiita Popular source already exists');
    } else {
      console.error('❌ Error creating source:', error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addQiitaPopularSource().catch(console.error);