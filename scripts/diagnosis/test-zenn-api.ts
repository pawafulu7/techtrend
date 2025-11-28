/**
 * Zenn API診断スクリプト
 * ZennApiEnricherの動作を手動テストするためのスクリプト
 *
 * Usage:
 *   npx tsx scripts/diagnosis/test-zenn-api.ts
 */

import { ZennService } from '@/lib/services/zenn-service';
import { ZennApiEnricher } from '@/lib/enrichers/zenn-api';

async function testZennAPI() {
  console.log('=== Zenn API診断スクリプト ===\n');

  const testUrls = [
    'https://zenn.dev/peloeil/articles/e82cf581193fe4',
    'https://zenn.dev/invalid/articles/nonexistent',
    'https://example.com/not-zenn',
  ];

  for (const url of testUrls) {
    console.log(`\n--- Testing URL: ${url} ---`);

    // 1. URL判定テスト
    const isZennUrl = ZennService.isZennArticleUrl(url);
    console.log(`  Is Zenn URL: ${isZennUrl}`);

    if (!isZennUrl) {
      console.log('  Skipping non-Zenn URL');
      continue;
    }

    // 2. スラッグ抽出テスト
    const slug = ZennService.extractSlugFromUrl(url);
    console.log(`  Extracted Slug: ${slug || 'null'}`);

    if (!slug) {
      console.log('  Failed to extract slug');
      continue;
    }

    // 3. API呼び出しテスト
    try {
      console.log('  Fetching article from API...');
      const startTime = Date.now();
      const data = await ZennService.fetchWithRetry(slug);
      const duration = Date.now() - startTime;

      console.log(`  ✓ API fetch successful (${duration}ms)`);
      console.log(`    - Title: ${data.article.title}`);
      console.log(`    - ID: ${data.article.id}`);
      console.log(`    - Published: ${data.article.published_at}`);
      console.log(`    - Body HTML length: ${data.article.body_html.length} chars`);
      console.log(`    - Body letters count: ${data.article.body_letters_count}`);
      console.log(`    - Liked: ${data.article.liked_count}`);
      console.log(`    - Bookmarked: ${data.article.bookmarked_count}`);
      console.log(`    - Topics: ${data.article.topics.join(', ')}`);
      console.log(`    - Author: ${data.article.user.username}`);
    } catch (error) {
      console.log(`  ✗ API fetch failed: ${(error as Error).message}`);
      continue;
    }

    // 4. Enricher テスト
    try {
      console.log('  Testing ZennApiEnricher...');
      const enricher = new ZennApiEnricher();
      const enrichStart = Date.now();
      const result = await enricher.enrich(url);
      const enrichDuration = Date.now() - enrichStart;

      if (result) {
        console.log(`  ✓ Enrichment successful (${enrichDuration}ms)`);
        console.log(`    - Content length: ${result.content?.length || 0} chars`);
        console.log(`    - Thumbnail: ${result.thumbnail || 'null'}`);
        console.log(`    - Content preview: ${result.content?.substring(0, 100)}...`);
      } else {
        console.log('  ✗ Enrichment returned null');
      }
    } catch (error) {
      console.log(`  ✗ Enrichment failed: ${(error as Error).message}`);
    }
  }

  console.log('\n=== 診断完了 ===');
}

testZennAPI().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
