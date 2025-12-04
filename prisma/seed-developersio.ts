import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding DevelopersIO sources to database...');

  // DevelopersIO tag-based sources
  const developersioSources = [
    {
      id: 'developersio_aws',
      name: 'DevelopersIO AWS',
      type: 'rss' as const,
      url: 'https://dev.classmethod.jp/tags/aws/feed/',
      enabled: true,
    },
    {
      id: 'developersio_ai',
      name: 'DevelopersIO AI',
      type: 'rss' as const,
      url: 'https://dev.classmethod.jp/tags/generative-ai/feed/',
      enabled: true,
    },
    {
      id: 'developersio_claude',
      name: 'DevelopersIO Claude',
      type: 'rss' as const,
      url: 'https://dev.classmethod.jp/tags/claude/feed/',
      enabled: true,
    },
    {
      id: 'developersio_mcp',
      name: 'DevelopersIO MCP',
      type: 'rss' as const,
      url: 'https://dev.classmethod.jp/tags/mcp/feed/',
      enabled: true,
    },
    {
      id: 'developersio_security',
      name: 'DevelopersIO Security',
      type: 'rss' as const,
      url: 'https://dev.classmethod.jp/tags/security/feed/',
      enabled: true,
    },
  ];

  for (const source of developersioSources) {
    // Use upsert for idempotency
    const upsertedSource = await prisma.source.upsert({
      where: { id: source.id },
      update: {
        name: source.name,
        url: source.url,
        enabled: source.enabled,
      },
      create: source,
    });

    console.log(`Upserted source: ${upsertedSource.name} (ID: ${upsertedSource.id})`);
  }

  console.log('DevelopersIO sources added successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding DevelopersIO sources:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
