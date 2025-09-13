/**
 * HTML Sanitizer Utility
 *
 * Provides safe HTML entity decoding and sanitization functions
 * to prevent XSS attacks and double-escaping vulnerabilities.
 *
 * @module html-sanitizer
 */

/**
 * Decode HTML entities safely
 *
 * Process HTML entities in the correct order to prevent double-unescaping.
 * The &amp; entity is processed last to avoid issues with nested entities.
 *
 * @param html - HTML string containing entities
 * @returns Decoded string
 */
export function decodeHtmlEntities(html: string): string {
  if (!html) return '';

  return html
    // Process standard entities first (except &amp;)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#60;/g, '<')  // Numeric entity for <
    .replace(/&#62;/g, '>')  // Numeric entity for >
    // Process &amp; last to avoid double-unescaping
    .replace(/&amp;/g, '&');
}

/**
 * Strip HTML tags from a string
 *
 * Removes all HTML tags while preserving text content.
 *
 * @param html - HTML string
 * @returns Text without HTML tags
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';

  // Remove script and style content completely
  let result = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove all remaining HTML tags
  result = result.replace(/<[^>]*>/g, ' ');

  // Clean up whitespace
  result = result
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

/**
 * Sanitize HTML content
 *
 * Removes dangerous HTML elements and attributes while preserving safe content.
 * This function strips all HTML tags and then decodes entities safely.
 *
 * @param html - HTML string to sanitize
 * @returns Sanitized text content
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // First strip all HTML tags
  let sanitized = stripHtmlTags(html);

  // Then decode HTML entities safely
  sanitized = decodeHtmlEntities(sanitized);

  return sanitized;
}

/**
 * Clean HTML for text extraction
 *
 * Similar to sanitizeHtml but optimized for text extraction from HTML content.
 * Preserves more formatting and handles special cases.
 *
 * @param html - HTML string to clean
 * @returns Cleaned text content
 */
export function cleanHtml(html: string): string {
  if (!html) return '';

  let cleaned = html;

  // Remove script and style tags with their content
  cleaned = cleaned
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Replace block-level elements with spaces for better text flow
  cleaned = cleaned
    .replace(/<\/?(div|p|br|li|tr|h[1-6])[^>]*>/gi, ' ')
    .replace(/<\/?(ul|ol|table|thead|tbody|tfoot)[^>]*>/gi, ' ');

  // Remove all other HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Decode HTML entities in the correct order
  cleaned = cleaned
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Process other common entities
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    // Process &amp; last
    .replace(/&amp;/g, '&')
    // Remove any remaining entities
    .replace(/&[a-z]+;/gi, ' ');

  // Clean up whitespace
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Escape HTML special characters
 *
 * Converts special characters to their HTML entity equivalents
 * to prevent XSS when displaying user-generated content.
 *
 * @param text - Text to escape
 * @returns Escaped HTML string
 */
export function escapeHtml(text: string): string {
  if (!text) return '';

  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };

  return text.replace(/[&<>"'\/]/g, char => htmlEscapeMap[char] || char);
}