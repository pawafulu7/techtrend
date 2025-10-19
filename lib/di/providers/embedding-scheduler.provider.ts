import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';

let embeddingSchedulerInstance: EmbeddingScheduler | null = null;

export function getEmbeddingScheduler(): EmbeddingScheduler {
  if (!embeddingSchedulerInstance) {
    embeddingSchedulerInstance = new EmbeddingScheduler();
  }
  return embeddingSchedulerInstance;
}
