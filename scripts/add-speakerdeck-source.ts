import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSpeakerDeckSource() {
  try {
    const source = await prisma.source.create({
      data: {
        name: 'Speaker Deck',
        url: 'https://speakerdeck.com',
        type: 'RSS',
        enabled: true
      }
    });

    console.log('✅ Speaker Deck ソースを追加しました:', source);
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addSpeakerDeckSource();