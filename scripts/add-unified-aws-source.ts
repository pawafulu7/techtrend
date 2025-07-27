import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addUnifiedAWSSource() {
  console.log('Adding unified AWS source...');

  try {
    const source = await prisma.source.create({
      data: {
        name: 'AWS',
        type: 'RSS',
        url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', // 代表URLとして設定
        enabled: true,
      },
    });

    console.log(`✅ Created unified source: ${source.name} (ID: ${source.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      console.log('ℹ️  AWS source already exists');
    } else {
      console.error('❌ Error creating AWS source:', error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addUnifiedAWSSource().catch(console.error);