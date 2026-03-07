import { sanitizeHtml } from './html-sanitizer';
import { isUrlFromDomain } from './url/url-validator';

const CLOUDINARY_BASE = 'https://res.cloudinary.com/zenn/image/upload';
const OG_BACKGROUND = 'v1627283836/default/og-bg-zenn.png';
const AUTHOR_TEXT_STYLE =
  'co_rgb:222%2Cg_south_west%2Cl_text:notosansjp-medium.otf_37_bold';
const TITLE_TEXT_STYLE =
  'c_fit%2Cco_rgb:222%2Cg_north_west%2Cl_text:notosansjp-medium.otf_70_bold';
const IMAGE_SIZE = 'bo_3px_solid_rgb:d6d6d6%2Cg_center%2Ch_630%2Cw_1200';
const TITLE_MAX_LENGTH = 120;

/**
 * Zenn article URL pattern to extract author slug and article ID
 */
const ZENN_ARTICLE_PATTERN = /zenn\.dev\/([^\/]+)\/articles\/([^\/\?]+)/;

/**
 * Safely slice a string without breaking surrogate pairs.
 * Uses Array.from to handle multi-byte characters correctly.
 */
function safeSlice(str: string, maxLength: number): string {
  const chars = Array.from(str);
  if (chars.length <= maxLength) return str;
  return chars.slice(0, maxLength).join('');
}

/**
 * Generate a Cloudinary OGP thumbnail URL from a Zenn article URL.
 * Returns undefined if the URL is not a valid Zenn article URL or if generation fails.
 */
export function generateZennThumbnail(
  link: string,
  title?: string
): string | undefined {
  try {
    const parsed = new URL(link);
    if (parsed.protocol !== 'https:') return undefined;
    if (!isUrlFromDomain(link, 'zenn.dev')) return undefined;

    const match = link.match(ZENN_ARTICLE_PATTERN);
    if (!match) return undefined;

    const authorSlug = encodeURIComponent(match[1]);
    const sanitizedTitle = sanitizeHtml(title || 'Article') || 'Article';
    const safeTitle = safeSlice(sanitizedTitle, TITLE_MAX_LENGTH);
    const encodedTitle = encodeURIComponent(safeTitle);

    return `${CLOUDINARY_BASE}/s--og-default--/${AUTHOR_TEXT_STYLE}:${authorSlug}%2Cx_203%2Cy_98/${TITLE_TEXT_STYLE}:${encodedTitle}%2Cw_1010%2Cx_90%2Cy_100/${IMAGE_SIZE}/${OG_BACKGROUND}`;
  } catch {
    return undefined;
  }
}
