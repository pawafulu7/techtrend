import { prisma } from '../lib/database';

async function updateTechCrunchUrl() {
  console.log('TechCrunch JapanのURLを更新します...\n');

  const techcrunch = await prisma.source.findFirst({
    where: { name: 'TechCrunch Japan' }
  });

  if (!techcrunch) {
    console.log('TechCrunch Japanが見つかりません');
    return;
  }

  // URLを更新
  await prisma.source.update({
    where: { id: techcrunch.id },
    data: {
      url: 'https://techcrunch.com/category/japan/feed/'
    }
  });

  console.log('✓ URLを更新しました');
  console.log('  旧URL:', techcrunch.url);
  console.log('  新URL: https://techcrunch.com/category/japan/feed/');
}

updateTechCrunchUrl()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });