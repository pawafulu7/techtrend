import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';

async function testGoogleAIEnricher() {
  const enricher = new GoogleAIEnricher();
  const testUrls = [
    'https://blog.google/products/search/ai-mode-agentic-personalized/',
    'https://blog.google/technology/ai/podcast-pixel-10-10-years-of-ai/',
    'https://blog.google/products/pixel/pixel-10-and-ai/'
  ];

  console.error('Testing GoogleAIEnricher...\n');

  for (const url of testUrls) {
    console.error(`URL: ${url}`);
    console.error(`Can handle: ${enricher.canHandle(url)}`);
    
    if (enricher.canHandle(url)) {
      console.error('Attempting to enrich...');
      try {
        const result = await enricher.enrich(url);
        if (result) {
          console.error(`Content length: ${result.content?.length || 0} characters`);
          console.error(`Thumbnail: ${result.thumbnail || 'None'}`);
          if (result.content) {
            console.error(`First 200 chars: ${result.content.substring(0, 200)}...`);
          }
        } else {
          console.error('Enrichment failed (returned null)');
        }
      } catch (error) {
        console.error('Error during enrichment:', error);
      }
    }
    console.error('---');
  }
}

testGoogleAIEnricher().catch(console.error);