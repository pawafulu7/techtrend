import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// arXiv AI source uses a fixed ID for consistent filtering across the app
// IMPORTANT: This value MUST match lib/constants/source-categories.ts ARXIV_SOURCE_ID
// We duplicate it here because seed scripts can't use TypeScript path aliases (@/)
const ARXIV_SOURCE_ID = 'cmfxa7efs0001teo0kjt70c5k';

// Claude Blog source uses a fixed ID for consistent filtering
// IMPORTANT: This value MUST match lib/constants/source-categories.ts
const CLAUDE_BLOG_SOURCE_ID = 'claude_blog_official';

// Anthropic News source uses a fixed ID for consistent filtering
// IMPORTANT: This value MUST match lib/constants/source-categories.ts
const ANTHROPIC_NEWS_SOURCE_ID = 'anthropic_news';

// Sources that require fixed IDs for app-wide filtering
const FIXED_ID_SOURCES = new Set([ARXIV_SOURCE_ID, CLAUDE_BLOG_SOURCE_ID, ANTHROPIC_NEWS_SOURCE_ID]);

async function main() {
  console.log('Adding AI/LLM sources to database...');

  // AI/LLM関連の新規ソースを追加
  // Note: arXiv AI uses a fixed ID (ARXIV_SOURCE_ID) for excludeSources filtering
  const aiSources = [
    {
      name: 'OpenAI Blog',
      type: 'RSS' as const,
      url: 'https://openai.com/blog/rss.xml',
      enabled: true,
    },
    {
      name: 'Hugging Face Papers',
      type: 'RSS' as const,
      url: 'https://rsshub.app/huggingface/daily-papers',
      enabled: true,
    },
    {
      // Use explicit ID for arXiv AI to ensure consistent filtering
      id: ARXIV_SOURCE_ID,
      name: 'arXiv AI',
      type: 'RSS' as const,
      url: 'https://rss.arxiv.org/rss/cs.AI',
      enabled: true,
    },
    {
      name: 'Zenn AI',
      type: 'RSS' as const,
      url: 'https://zenn.dev/topics/llm/feed',
      enabled: true,
    },
    {
      name: 'Qiita AI',
      type: 'RSS' as const,
      url: 'https://qiita.com/tags/llm/feed',
      enabled: true,
    },
    {
      // Use explicit ID for Claude Blog to ensure consistent filtering
      id: CLAUDE_BLOG_SOURCE_ID,
      name: 'Claude Blog',
      type: 'SCRAPER' as const,
      url: 'https://claude.com/blog',
      enabled: true,
    },
    {
      // Use explicit ID for Anthropic News to ensure consistent filtering
      id: ANTHROPIC_NEWS_SOURCE_ID,
      name: 'Anthropic News',
      type: 'SCRAPER' as const,
      url: 'https://www.anthropic.com/news',
      enabled: true,
      groupId: 'group_company_global',
    },
  ];

  for (const source of aiSources) {
    // Sources with fixed IDs use upsert to ensure ID consistency
    // This handles the case where source exists with a different ID
    if ('id' in source && FIXED_ID_SOURCES.has(source.id)) {
      const upsertedSource = await prisma.source.upsert({
        where: { id: source.id },
        update: {
          name: source.name,
          type: source.type,
          url: source.url,
          enabled: source.enabled,
        },
        create: source,
      });
      console.log(
        `Upserted source: ${upsertedSource.name} (ID: ${upsertedSource.id})`
      );

      // Also check if there's a duplicate with the same name but different ID
      const duplicate = await prisma.source.findFirst({
        where: {
          name: source.name,
          id: { not: source.id },
        },
      });
      if (duplicate) {
        console.warn(
          `Warning: Found duplicate "${source.name}" with different ID (${duplicate.id}). ` +
            `Consider migrating articles to the canonical ID (${source.id}).`
        );
      }
      continue;
    }

    // Other sources use the original name-based check
    const existingSource = await prisma.source.findFirst({
      where: {
        name: source.name,
      },
    });

    if (existingSource) {
      console.log(`Source "${source.name}" already exists, skipping...`);
      continue;
    }

    // 新規ソースを作成
    const createdSource = await prisma.source.create({
      data: source,
    });

    console.log(`Created source: ${createdSource.name} (ID: ${createdSource.id})`);
  }

  console.log('AI/LLM sources added successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding AI sources:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });