import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMissingSourceTags() {
  console.log('取得元タグが付いていない記事を確認中...\n');

  try {
    // SRE記事の確認
    const sreArticles = await prisma.article.findMany({
      where: {
        source: { name: 'SRE' }
      },
      include: {
        tags: true
      }
    });

    const expectedSRETags = ['HashiCorp', 'CNCF', 'Grafana', 'SRE Weekly'];
    const sreWithoutSourceTag = sreArticles.filter(article => {
      const tagNames = article.tags.map(t => t.name);
      return !expectedSRETags.some(tag => tagNames.includes(tag));
    });

    console.log('【SRE記事】');
    console.log(`総数: ${sreArticles.length}件`);
    console.log(`取得元タグなし: ${sreWithoutSourceTag.length}件`);
    if (sreWithoutSourceTag.length > 0) {
      console.log('\n取得元タグがない記事:');
      sreWithoutSourceTag.forEach(article => {
        console.log(`  - ${article.title.substring(0, 60)}...`);
      });
    }

    // AWS記事の確認
    const awsArticles = await prisma.article.findMany({
      where: {
        source: { name: 'AWS' }
      },
      include: {
        tags: true
      }
    });

    const expectedAWSTags = ['Security Bulletins', "What's New", 'News Blog'];
    const awsWithoutSourceTag = awsArticles.filter(article => {
      const tagNames = article.tags.map(t => t.name);
      return !expectedAWSTags.some(tag => tagNames.includes(tag));
    });

    console.log('\n【AWS記事】');
    console.log(`総数: ${awsArticles.length}件`);
    console.log(`取得元タグなし: ${awsWithoutSourceTag.length}件`);
    if (awsWithoutSourceTag.length > 0) {
      console.log('\n取得元タグがない記事:');
      awsWithoutSourceTag.forEach(article => {
        console.log(`  - ${article.title.substring(0, 60)}...`);
      });
    }

    // タグ分布の確認
    console.log('\n【タグ分布】');
    
    // SREタグ分布
    console.log('\nSRE記事のタグ分布:');
    const sreTagCounts: Record<string, number> = {};
    expectedSRETags.forEach(tag => sreTagCounts[tag] = 0);
    sreArticles.forEach(article => {
      const tagNames = article.tags.map(t => t.name);
      expectedSRETags.forEach(tag => {
        if (tagNames.includes(tag)) sreTagCounts[tag]++;
      });
    });
    Object.entries(sreTagCounts).forEach(([tag, count]) => {
      console.log(`  ${tag}: ${count}件`);
    });

    // AWSタグ分布
    console.log('\nAWS記事のタグ分布:');
    const awsTagCounts: Record<string, number> = {};
    expectedAWSTags.forEach(tag => awsTagCounts[tag] = 0);
    awsArticles.forEach(article => {
      const tagNames = article.tags.map(t => t.name);
      expectedAWSTags.forEach(tag => {
        if (tagNames.includes(tag)) awsTagCounts[tag]++;
      });
    });
    Object.entries(awsTagCounts).forEach(([tag, count]) => {
      console.log(`  ${tag}: ${count}件`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkMissingSourceTags().catch(console.error);