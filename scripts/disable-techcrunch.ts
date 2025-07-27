import { prisma } from '../lib/database';

async function disableTechCrunch() {
  console.log('TechCrunch Japanを無効化します...\n');

  const techcrunch = await prisma.source.findFirst({
    where: { name: 'TechCrunch Japan' }
  });

  if (!techcrunch) {
    console.log('TechCrunch Japanが見つかりません');
    return;
  }

  await prisma.source.update({
    where: { id: techcrunch.id },
    data: {
      enabled: false
    }
  });

  console.log('✓ TechCrunch Japanを無効化しました');
}

disableTechCrunch()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });