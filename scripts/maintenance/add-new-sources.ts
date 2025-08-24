import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addNewSources() {
  console.error('Adding new AI and Tech blog sources...');

  const sources = [
    {
      name: 'Hugging Face Blog',
      url: 'https://huggingface.co/blog/feed.xml',
      type: 'RSS',
      enabled: true,
    },
    {
      name: 'Google AI Blog',
      url: 'https://blog.google/technology/ai/rss/',
      type: 'RSS',
      enabled: true,
    },
    {
      name: 'InfoQ Japan',
      url: 'https://feed.infoq.com/jp',
      type: 'RSS',
      enabled: true,
    },
  ];

  for (const source of sources) {
    try {
      // Check if source already exists
      const existing = await prisma.source.findUnique({
        where: { name: source.name },
      });

      if (existing) {
        console.error(`Source "${source.name}" already exists. Updating URL if different...`);
        if (existing.url !== source.url) {
          await prisma.source.update({
            where: { name: source.name },
            data: { url: source.url, enabled: source.enabled },
          });
          console.error(`Updated URL for "${source.name}"`);
        }
      } else {
        await prisma.source.create({
          data: source,
        });
        console.error(`Added new source: "${source.name}"`);
      }
    } catch (error) {
      console.error(`Failed to add/update source "${source.name}":`, error);
    }
  }

  console.error('Completed adding new sources');
}

async function main() {
  try {
    await addNewSources();
  } catch (error) {
    console.error('Error adding sources:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();