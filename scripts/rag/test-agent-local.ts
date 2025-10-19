/**
 * Local Agent Testing Script
 *
 * Tests the article search agent locally without starting the dev server.
 *
 * Usage:
 *   npx tsx scripts/rag/test-agent-local.ts
 *
 * Requirements:
 * - OPENAI_API_KEY in .env
 * - DATABASE_URL (for VectorSearchService)
 * - Embedded articles in database
 *
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:2104-2152
 */

import 'dotenv/config';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';

const TEST_QUERIES = [
  'terraformについての記事をおすすめ5件教えて',
  'React performance optimization',
  '最新のNext.js記事を3件教えて',
];

async function main() {
  console.log('='.repeat(60));
  console.log(' Testing Article Search Agent Locally');
  console.log('='.repeat(60));
  console.log('');

  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not found in environment');
    console.error('Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  for (const query of TEST_QUERIES) {
    console.log(`\nQuery: "${query}"`);
    console.log('-'.repeat(60));

    const startTime = Date.now();

    try {
      const result = await articleSearchAgent.generate({
        messages: [{ role: 'user', content: query }],
      });

      const latency = Date.now() - startTime;

      console.log(`\nResponse (${latency}ms):`);
      console.log(result.text);

      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`\nTool Calls: ${result.toolCalls.length}`);
        result.toolCalls.forEach((call, idx) => {
          console.log(`  ${idx + 1}. ${call.toolName}`);
          console.log(`     Input:`, JSON.stringify(call.input, null, 2));
        });
      }

      if (result.usage) {
        console.log(`\nToken Usage:`);
        console.log(`  Prompt: ${result.usage.promptTokens}`);
        console.log(`  Completion: ${result.usage.completionTokens}`);
        console.log(`  Total: ${result.usage.totalTokens}`);
      }

      console.log('\n' + '='.repeat(60));
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`\nERROR (${latency}ms):`, error instanceof Error ? error.message : error);
      console.log('\n' + '='.repeat(60));
    }
  }

  console.log('\n✅ Testing completed\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
