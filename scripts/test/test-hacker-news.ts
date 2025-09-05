import { prisma } from '@/lib/prisma';
import { HackerNewsFetcher } from '@/lib/fetchers/hacker-news';

async function testHackerNews() {
  try {
    console.log('Testing Hacker News Fetcher...');
    
    // Get source from database
    const source = await prisma.source.findUnique({
      where: { id: 'hacker_news_202508' }
    });
    
    if (!source) {
      console.error('Source not found in database');
      return;
    }
    
    console.log('Source found:', source.name);
    
    // Create fetcher instance
    const fetcher = new HackerNewsFetcher(source);
    
    // Fetch articles
    console.log('Fetching articles from Hacker News API...');
    const result = await fetcher.fetch();
    
    console.log(`✅ Fetched ${result.articles.length} articles`);
    
    if (result.errors.length > 0) {
      console.log(`⚠️ Errors: ${result.errors.length}`);
      result.errors.forEach(err => console.error(err.message));
    }
    
    // Show first 3 articles
    result.articles.slice(0, 3).forEach((article, i) => {
      console.log(`\n[${i + 1}] ${article.title}`);
      console.log(`    URL: ${article.url}`);
      console.log(`    Date: ${article.publishedAt}`);
      console.log(`    Tags: ${(article.tagNames ?? []).join(', ')}`);
      console.log(`    Content Length: ${article.content ? article.content.length : 0} chars`);
      if (article.metadata) {
        console.log(`    HN Score: ${article.metadata.hnScore}`);
        console.log(`    HN Comments: ${article.metadata.hnComments}`);
      }
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testHackerNews();