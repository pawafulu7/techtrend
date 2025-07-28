import { PrismaClient, SourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function addGoogleDevBlog() {
  try {
    const source = await prisma.source.create({
      data: {
        name: 'Google Developers Blog',
        type: SourceType.RSS,
        url: 'https://developers.googleblog.com/feeds/posts/default',
        enabled: true,
      },
    });

    console.log('✅ Google Developers Blogを追加しました:', source);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addGoogleDevBlog();