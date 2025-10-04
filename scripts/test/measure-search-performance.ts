import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestCase {
  keyword: string;
  lang: string;
  description: string;
}

async function measureSearchPerformance() {
  const testCases: TestCase[] = [
    { keyword: 'React', lang: 'English', description: 'Single English keyword' },
    { keyword: 'TypeScript', lang: 'English', description: 'Single English keyword' },
    { keyword: 'Next.js', lang: 'English', description: 'English with special char' },
    { keyword: 'フォーム', lang: 'Japanese', description: 'Single Japanese keyword' },
    { keyword: '型推論', lang: 'Japanese', description: 'Multiple Japanese kanji' },
    { keyword: 'コンポーネント', lang: 'Japanese', description: 'Japanese katakana' },
    { keyword: 'React フォーム', lang: 'Mixed', description: 'English + Japanese' },
    { keyword: 'TypeScript 型推論', lang: 'Mixed', description: 'English + Japanese kanji' },
  ];

  console.log('');
  console.log('='.repeat(80));
  console.log('Search Performance Test with pg_trgm Indexes');
  console.log('='.repeat(80));
  console.log('');

  const results: Array<{ keyword: string; lang: string; time: number; count: number }> = [];

  for (const { keyword, lang, description } of testCases) {
    const start = Date.now();

    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { summary: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      take: 100,
      select: {
        id: true,
        title: true,
      },
    });

    const end = Date.now();
    const time = end - start;

    results.push({ keyword, lang, time, count: articles.length });

    console.log(`[${lang.padEnd(8)}] "${keyword.padEnd(20)}" | ${time.toString().padStart(5)}ms | ${articles.length.toString().padStart(3)} results`);
    console.log(`  Description: ${description}`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log('');

  const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
  const maxTime = Math.max(...results.map(r => r.time));
  const minTime = Math.min(...results.map(r => r.time));

  console.log(`Average search time: ${avgTime.toFixed(2)}ms`);
  console.log(`Minimum search time: ${minTime}ms`);
  console.log(`Maximum search time: ${maxTime}ms`);
  console.log('');

  console.log('Performance Targets:');
  console.log(`  - Each search < 500ms: ${results.every(r => r.time < 500) ? 'PASS' : 'FAIL'}`);
  console.log(`  - Mixed search < 1000ms: ${results.filter(r => r.lang === 'Mixed').every(r => r.time < 1000) ? 'PASS' : 'FAIL'}`);
  console.log('');

  console.log('Language Support:');
  console.log(`  - English: ${results.filter(r => r.lang === 'English' && r.count > 0).length}/${results.filter(r => r.lang === 'English').length} keywords found results`);
  console.log(`  - Japanese: ${results.filter(r => r.lang === 'Japanese' && r.count > 0).length}/${results.filter(r => r.lang === 'Japanese').length} keywords found results`);
  console.log(`  - Mixed: ${results.filter(r => r.lang === 'Mixed' && r.count > 0).length}/${results.filter(r => r.lang === 'Mixed').length} keywords found results`);
  console.log('');

  await prisma.$disconnect();
}

measureSearchPerformance().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
