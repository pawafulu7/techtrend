import { prisma } from '../lib/database';

async function disableProblematicSources() {
  console.log('問題のあるソースを無効化します...\n');
  
  const sourcesToDisable = ['connpass', 'InfoQ Japan'];
  
  for (const sourceName of sourcesToDisable) {
    try {
      const source = await prisma.source.findFirst({
        where: { name: sourceName }
      });
      
      if (source && source.enabled) {
        await prisma.source.update({
          where: { id: source.id },
          data: { enabled: false }
        });
        console.log(`✓ ${sourceName} を無効化しました`);
      } else if (source) {
        console.log(`- ${sourceName} は既に無効化されています`);
      } else {
        console.log(`- ${sourceName} が見つかりません`);
      }
    } catch (error) {
      console.error(`✗ ${sourceName} の無効化に失敗:`, error);
    }
  }
  
  console.log('\n現在有効なソース:');
  const enabledSources = await prisma.source.findMany({
    where: { enabled: true },
    orderBy: { name: 'asc' }
  });
  
  enabledSources.forEach((source, index) => {
    console.log(`${index + 1}. ${source.name}`);
  });
}

disableProblematicSources()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });