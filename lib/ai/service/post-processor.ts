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
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== '・');

    // Defensive processing: merge bullet headers with continuation lines
    const bulletLinePattern = /^(?:・|[-*•]|\d+[\.．、)]|[A-Za-z]\)|\([0-9]+\)|\([a-z]\))/i;
    const hasTrailingColon = (value: string) => /[:：]\s*$/.test(value);
    const isBulletLine = (value: string) => bulletLinePattern.test(value);

    const normalized: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] ?? '';

      if (
        hasTrailingColon(line) &&
        isBulletLine(line) &&
        i + 1 < lines.length &&
        !isBulletLine(nextLine)
      ) {
        normalized.push(`${line.replace(/\s+$/, '')} ${nextLine}`);
        i++; // Skip the next line because it has been merged
      } else {
        normalized.push(line);
      }
    }

    return normalized
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
