#!/usr/bin/env -S tsx
import { prisma } from '../../lib/prisma';
import { MozillaHacksFetcher } from '../../lib/fetchers/mozilla-hacks';

async function testMozillaHacks() {
  try {
    console.log('Testing Mozilla Hacks Fetcher...');
    
    // Get source from database
    const source = await prisma.source.findUnique({
      where: { id: 'mozilla_hacks_202508' }
    });
    
    let sourceToUse = source;
    
    if (!source) {
      console.error('Source not found in database. Creating test source...');
      // Create a test source if it doesn't exist
      sourceToUse = await prisma.source.create({
        data: {
          id: 'mozilla_hacks_202508',
          name: 'Mozilla Hacks',
          type: 'RSS',
          url: 'https://hacks.mozilla.org/feed/',
          enabled: true
        }
      });
      console.log('Test source created:', sourceToUse.name);
    } else {
      console.log('Source found:', sourceToUse.name);
    }
    
    // Create fetcher instance
    const fetcher = new MozillaHacksFetcher(sourceToUse);
    
    // Fetch articles
    console.log('Fetching articles...');
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
      console.log(`    Tags: ${article.tagNames.join(', ')}`);
      console.log(`    Content Length: ${article.content ? article.content.length : 0} chars`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testMozillaHacks().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});