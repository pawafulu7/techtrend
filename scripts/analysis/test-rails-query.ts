import 'dotenv/config';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';

async function main() {
  const query = 'railsの性能改善に寄与しそうな記事を教えて';

  console.log('='.repeat(60));
  console.log(`Query: "${query}"`);
  console.log('='.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    const result = await articleSearchAgent.generate({
      messages: [{ role: 'user', content: query }],
    });

    const latency = Date.now() - startTime;

    console.log(`Response (${latency}ms):`);
    console.log('');
    console.log(result.text);
    console.log('');

    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('='.repeat(60));
      console.log(`Tool Calls: ${result.toolCalls.length}`);
      result.toolCalls.forEach((call, idx) => {
        console.log(`  ${idx + 1}. ${call.toolName}`);
        console.log(`     Input:`, JSON.stringify(call.input, null, 2));
      });
    }

    if (result.usage) {
      console.log('');
      console.log('Token Usage:');
      console.log(`  Prompt: ${result.usage.promptTokens || 'N/A'}`);
      console.log(`  Completion: ${result.usage.completionTokens || 'N/A'}`);
      console.log(`  Total: ${result.usage.totalTokens}`);
    }

    console.log('');
    console.log('='.repeat(60));
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`ERROR (${latency}ms):`, error instanceof Error ? error.message : error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
