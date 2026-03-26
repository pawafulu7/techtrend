import { prisma } from '@/lib/prisma';
import {
  shouldProcess,
  saveProcessingStatus,
} from '../utils/processing-status';
import { ExternalMetricsOrchestrator } from '@/lib/services/external-metrics';

const PROCESS_NAME = 'external-metrics-collection';
const INTERVAL_HOURS = 12;

async function main(): Promise<void> {
  console.log(`[${PROCESS_NAME}] Starting external metrics collection...`);

  try {
    // Check if enough time has passed since last run
    const needsProcessing = await shouldProcess(PROCESS_NAME, INTERVAL_HOURS);
    if (!needsProcessing) {
      console.log(`[${PROCESS_NAME}] Skipping: last run was less than ${INTERVAL_HOURS} hours ago`);
      return;
    }

    const orchestrator = ExternalMetricsOrchestrator.createDefault(prisma);
    const result = await orchestrator.collectAll();

    // Determine status based on results
    const status = result.errors > 0 && result.collected > 0
      ? 'partial'
      : result.errors > 0 && result.collected === 0
        ? 'failed'
        : 'success';

    await saveProcessingStatus(PROCESS_NAME, result.collected, status as 'success' | 'failed' | 'partial', {
      collected: result.collected,
      errors: result.errors,
      skipped: result.skipped,
    });

    console.log(
      `[${PROCESS_NAME}] Completed: collected=${result.collected}, errors=${result.errors}, skipped=${result.skipped}, status=${status}`
    );
  } catch (error) {
    console.error(
      `[${PROCESS_NAME}] Fatal error:`,
      error instanceof Error ? error.message : String(error)
    );

    await saveProcessingStatus(PROCESS_NAME, 0, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Direct execution
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as collectExternalMetrics };
