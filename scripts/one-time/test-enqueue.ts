import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  const testArticleId = 'cmiflir2t0001tej09vy76bee';
  
  console.log('Testing enqueue for article:', testArticleId);
  
  try {
    const result = await prisma.embeddingJob.upsert({
      where: { articleId: testArticleId },
      create: {
        articleId: testArticleId,
        status: 'PENDING',
        attempts: 0,
        queuedAt: new Date(),
      },
      update: {
        status: 'PENDING',
        attempts: 0,
        queuedAt: new Date(),
        error: null,
        processedAt: null,
      },
    });
    
    console.log('✅ Enqueue successful');
    console.log('Job:', result);
  } catch (error) {
    console.error('❌ Enqueue failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
