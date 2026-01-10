import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// arXiv AI source uses a fixed ID for consistent filtering across the app
// This ID is defined in lib/constants/source-categories.ts as ARXIV_SOURCE_ID
const ARXIV_SOURCE_ID = 'cmfxa7efs0001teo0kjt70c5k';

async function main() {
  console.log('Adding AI/LLM sources to database...');

  // AI/LLM関連の新規ソースを追加
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
  ];

  for (const source of aiSources) {
    // 既存のソースをチェック
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