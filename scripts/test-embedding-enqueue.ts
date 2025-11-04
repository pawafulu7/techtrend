#!/usr/bin/env npx tsx

/**
 * Test script to verify embedding job enqueuing works correctly
 */

import { prisma } from '@/lib/prisma';
import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

async function testEmbeddingEnqueue() {
  console.log('='.repeat(60));
  console.log('Testing Embedding Job Enqueue');
  console.log('='.repeat(60));
  console.log();

  try {
    // Get a recent article without embedding jobs
    const article = await prisma.article.findFirst({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    if (!article) {
      console.log('No recent articles found for testing');
      return;
    }

    console.log(`Test Article: ${article.title}`);
    console.log(`Article ID: ${article.id}`);
    console.log(`Published: ${article.publishedAt.toISOString()}`);
    console.log();

    // Check existing embedding job
    const existingJob = await prisma.embeddingJob.findUnique({
      where: { articleId: article.id },
    });

    console.log(`Existing Embedding Job: ${existingJob ? 'YES' : 'NO'}`);
    if (existingJob) {
      console.log(`  Status: ${existingJob.status}`);
      console.log(`  Attempts: ${existingJob.attempts}`);
      console.log(`  Created: ${existingJob.createdAt.toISOString()}`);
    }
    console.log();

    // Test generate with articleId
    console.log('Calling generate() with articleId...');
    const service = new UnifiedSummaryService();

    const result = await service.generate(
      article.title,
      article.content || article.url,
      undefined,
      undefined,
      article.id // This should trigger embedding job enqueue
    );

    console.log(`Summary Generated: ${result.summary.substring(0, 100)}...`);
    console.log(`Quality Score: ${result.qualityScore}`);
    console.log();

    // Check if embedding job was created/updated
    const newJob = await prisma.embeddingJob.findUnique({
      where: { articleId: article.id },
    });

    console.log(`Embedding Job After generate(): ${newJob ? 'YES' : 'NO'}`);
    if (newJob) {
      console.log(`  Status: ${newJob.status}`);
      console.log(`  Attempts: ${newJob.attempts}`);
      console.log(`  Created: ${newJob.createdAt.toISOString()}`);
      console.log(`  Queued: ${newJob.queuedAt.toISOString()}`);
    }
    console.log();

    const success = newJob !== null && newJob.status === 'PENDING';
    console.log('='.repeat(60));
    console.log(`Test Result: ${success ? 'PASSED' : 'FAILED'}`);
    console.log('='.repeat(60));

    if (!success) {
      process.exit(1);
    }

  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testEmbeddingEnqueue();
