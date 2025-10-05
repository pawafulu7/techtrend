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
    const normalized: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // If a bullet line ends with colon and next line is not a bullet, merge them
      if (/^・[^：\n]+：\s*$/.test(line) &&
          i + 1 < lines.length &&
          !/^・/.test(lines[i + 1])) {
        normalized.push(line + ' ' + lines[i + 1]);
        i++; // Skip the next line
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