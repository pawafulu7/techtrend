import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addAWSSources() {
  console.log('Adding AWS sources...');

  const awsSources = [
    {
      name: 'AWS Security Bulletins',
      url: 'https://aws.amazon.com/jp/security/security-bulletins/rss/feed/',
    },
    {
      name: 'AWS What\'s New',
      url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
    },
    {
      name: 'AWS News Blog',
      url: 'https://aws.amazon.com/jp/blogs/aws/feed/',
    },
  ];

  for (const sourceData of awsSources) {
    try {
      const source = await prisma.source.create({
        data: {
          name: sourceData.name,
          type: 'RSS',
          url: sourceData.url,
          enabled: true,
        },
      });

      console.log(`✅ Created source: ${source.name} (ID: ${source.id})`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        console.log(`ℹ️  ${sourceData.name} source already exists`);
      } else {
        console.error(`❌ Error creating ${sourceData.name} source:`, error);
      }
    }
  }

  await prisma.$disconnect();
}

addAWSSources().catch(console.error);