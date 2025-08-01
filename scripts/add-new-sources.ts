import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding new sources...');

  // GitHub Blogを追加
  const githubBlog = await prisma.source.upsert({
    where: { name: 'GitHub Blog' },
    update: {},
    create: {
      name: 'GitHub Blog',
      type: 'RSS',
      url: 'https://github.blog/',
      enabled: true,
    },
  });

  // Microsoft Developer Blogを追加
  const microsoftDevBlog = await prisma.source.upsert({
    where: { name: 'Microsoft Developer Blog' },
    update: {},
    create: {
      name: 'Microsoft Developer Blog',
      type: 'RSS',
      url: 'https://devblogs.microsoft.com/',
      enabled: true,
    },
  });

  console.log('✅ Added GitHub Blog:', githubBlog.id);
  console.log('✅ Added Microsoft Developer Blog:', microsoftDevBlog.id);
  
  // 確認
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    orderBy: { name: 'asc' },
  });
  
  console.log('\n現在の有効なソース:');
  sources.forEach(source => {
    console.log(`- ${source.name} (${source.type})`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });