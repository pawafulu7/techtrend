const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function disableErrorSources() {
  console.log('🔧 エラーが発生しているソースを無効化します...');

  try {
    // connpassを無効化（403エラー）
    const connpass = await prisma.source.updateMany({
      where: { name: 'connpass' },
      data: { enabled: false }
    });
    console.log(`✅ connpassを無効化しました（403エラーのため）`);

    // InfoQ Japanを無効化（記事が取得できない）
    const infoq = await prisma.source.updateMany({
      where: { name: 'InfoQ Japan' },
      data: { enabled: false }
    });
    console.log(`✅ InfoQ Japanを無効化しました（記事が取得できないため）`);

    // 現在有効なソースを確認
    const enabledSources = await prisma.source.findMany({
      where: { enabled: true },
      select: { name: true }
    });

    console.log('\n📋 現在有効なソース:');
    enabledSources.forEach(source => {
      console.log(`   - ${source.name}`);
    });

    console.log('\n✅ 完了しました');

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

disableErrorSources();