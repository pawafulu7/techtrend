export interface PostProcessor {
  cleanupSummary(text: string): string;

  cleanupDetailedSummary(text: string): string;

  formatTags(tags: string[]): string[];
}