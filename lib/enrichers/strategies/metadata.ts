import type { CheerioAPI } from 'cheerio';

export interface MetadataInput {
  title?: string;
  ogTitle?: string;
  ogDescription?: string;
  metaDescription?: string;
  twitterDescription?: string;
}

export function extractFromMetadata(
  $: CheerioAPI,
  metadata: MetadataInput
): string | null {
  const parts: string[] = [];

  if (metadata.title && !metadata.ogTitle) {
    parts.push(metadata.title);
  }
  if (metadata.ogTitle) {
    parts.push(metadata.ogTitle);
  }
  if (metadata.ogDescription) {
    parts.push(metadata.ogDescription);
  }
  if (
    metadata.metaDescription &&
    metadata.metaDescription !== metadata.ogDescription
  ) {
    parts.push(metadata.metaDescription);
  }
  if (
    metadata.twitterDescription &&
    metadata.twitterDescription !== metadata.ogDescription &&
    metadata.twitterDescription !== metadata.metaDescription
  ) {
    parts.push(metadata.twitterDescription);
  }

  const bodyText = $('body').text().trim();
  if (bodyText.length > 100) {
    const cleanBody = bodyText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .substring(0, 1000);
    parts.push(cleanBody);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}
