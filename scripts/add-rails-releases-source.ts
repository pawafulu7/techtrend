import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addRailsReleasesSource() {
  console.log('Adding Rails Releases source...');

  try {
    const source = await prisma.source.create({
      data: {
        name: 'Rails Releases',
        type: 'RSS',
        url: 'https://github.com/rails/rails/releases.atom',
        enabled: true,
      },
    });

    console.log(`✅ Created source: ${source.name} (ID: ${source.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      console.log('ℹ️  Rails Releases source already exists');
    } else {
      console.error('❌ Error creating source:', error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addRailsReleasesSource().catch(console.error);