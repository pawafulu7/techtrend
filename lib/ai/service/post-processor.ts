import { PostProcessor } from './post-processor.interface';

export class SummaryPostProcessor implements PostProcessor {
  cleanupSummary(text: string): string {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/。{2,}/g, '。')
      .replace(/、{2,}/g, '、')
      .trim();
  }

  cleanupDetailedSummary(text: string): string {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== '・')
      .join('\n')
      .replace(/。{2,}/g, '。')
      .replace(/、{2,}/g, '、');
  }

  formatTags(tags: string[]): string[] {
    return tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .slice(0, 10);
  }
}