import { Source } from '@/lib/prisma-exports';
import { BaseCorporateFetcher } from './corporate-blogs/base-corporate-fetcher';

/**
 * DevelopersIO supported tags for RSS feeds
 */
export const DEVELOPERSIO_TAGS = ['aws', 'generative-ai', 'claude', 'mcp', 'security'] as const;
export type DevelopersIOTag = (typeof DEVELOPERSIO_TAGS)[number];

/**
 * Type guard for DevelopersIOTag
 */
export function isDevelopersIOTag(tag: string): tag is DevelopersIOTag {
  return (DEVELOPERSIO_TAGS as readonly string[]).includes(tag);
}

/**
 * Map source name to DevelopersIO tag
 */
const SOURCE_NAME_TO_TAG: Record<string, DevelopersIOTag> = {
  'DevelopersIO AWS': 'aws',
  'DevelopersIO AI': 'generative-ai',
  'DevelopersIO Claude': 'claude',
  'DevelopersIO MCP': 'mcp',
  'DevelopersIO Security': 'security',
};

/**
 * Get DevelopersIO tag from source name
 */
export function getTagFromSourceName(sourceName: string): DevelopersIOTag | undefined {
  return SOURCE_NAME_TO_TAG[sourceName];
}

/**
 * Fetcher for DevelopersIO (dev.classmethod.jp) tag-based RSS feeds
 *
 * DevelopersIO provides tag-based RSS feeds at:
 * https://dev.classmethod.jp/tags/{tag}/feed/
 *
 * This fetcher supports multiple tags (aws, generative-ai, claude, mcp, security)
 * using a single class with tag parameter pattern.
 */
export class DevelopersIOFetcher extends BaseCorporateFetcher {
  private tag: DevelopersIOTag;

  constructor(source: Source, tag: DevelopersIOTag) {
    super(source);
    this.tag = tag;
  }

  protected getRssUrl(): string {
    return `https://dev.classmethod.jp/tags/${this.tag}/feed/`;
  }

  protected getCompanyName(): string {
    return 'DevelopersIO';
  }

  /**
   * Get the normalized company name including the tag for logging purposes
   */
  protected getNormalizedCompanyName(): string {
    return `DevelopersIO (${this.tag})`;
  }
}
