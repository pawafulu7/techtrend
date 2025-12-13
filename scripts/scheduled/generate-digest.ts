/**
 * Weekly Digest Generator
 *
 * 週次ダイジェストを生成するスケジュールスクリプト
 * GitHub Actionsから毎週月曜に実行される
 */

import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';

async function main() {
  console.log('=== Weekly Digest Generation ===');
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    const generator = new DigestGenerator(prisma);

    // 現在の週のダイジェストを生成
    const digestId = await generator.generateWeeklyDigest();

    console.log(`Successfully generated digest: ${digestId}`);
    console.log(`Completed at: ${new Date().toISOString()}`);
  } catch (error) {
    console.error('Failed to generate weekly digest:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
