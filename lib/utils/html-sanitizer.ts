/**
 * HTML Sanitizer Utility
 *
 * Provides safe HTML entity decoding and sanitization functions
 * to prevent XSS attacks and double-escaping vulnerabilities.
 *
 * @module html-sanitizer
 */

import sanitizeHtmlLib from 'sanitize-html';

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

  return (
    html
      // Process standard entities first (except &amp;)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#60;/g, '<') // Numeric entity for <
      .replace(/&#62;/g, '>') // Numeric entity for >
      // Process &amp; last to avoid double-unescaping
      .replace(/&amp;/g, '&')
  );
}

/**
 * Strip HTML tags from a string
 *
 * Removes all HTML tags while preserving text content.
 * Uses sanitize-html library for robust and secure tag removal.
 *
 * @param html - HTML string
 * @returns Text without HTML tags
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';

  // Pre-process: Add spaces where tags will be removed to preserve word boundaries
  let processedHtml = html;

  // Add space between text and tags
  processedHtml = processedHtml.replace(/>([^<]+)</g, '> $1 <');
  processedHtml = processedHtml.replace(/([^>])(<[^>]*>)([^<])/g, '$1 $2 $3');

  // Use sanitize-html library to safely remove all HTML tags
  const result = sanitizeHtmlLib(processedHtml, {
    allowedTags: [], // Remove all tags
    allowedAttributes: {}, // Remove all attributes
    textFilter: function (text) {
      return text; // Keep text content
    },
    exclusiveFilter: function (frame) {
      // Remove script and style tags completely including content
      return frame.tag === 'script' || frame.tag === 'style';
    },
  });

  // Clean up whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Sanitize HTML content
 *
 * Removes dangerous HTML elements and attributes while preserving safe content.
 * Uses sanitize-html library for comprehensive XSS protection.
 *
 * @param html - HTML string to sanitize
 * @returns Sanitized text content
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Use sanitize-html library with strict settings
  const sanitized = sanitizeHtmlLib(html, {
    allowedTags: [], // Remove all HTML tags for text-only output
    allowedAttributes: {},
    textFilter: function (text) {
      return text;
    },
  });

  // Decode HTML entities safely and clean whitespace
  return decodeHtmlEntities(sanitized).replace(/\s+/g, ' ').trim();
}

/**
 * Upper bound on passes that change the text in sanitizeUserInput.
 *
 * Each pass peels one layer (one level of entity encoding, or 8 levels of
 * nested <iframe>), so without a bound crafted input could force a full
 * re-parse per layer (the concern behind sanitize-html's
 * MAX_IFRAME_FALLBACK_DEPTH, GHSA-c9rx-x947-fp3h). Real input settles in 1-3.
 */
const MAX_USER_INPUT_PASSES = 10;

/**
 * `<` and `&` (as a run) right before a character that can begin a tag name,
 * comment, declaration or entity. Text without them passes through
 * sanitizeUserInputOnce unchanged.
 */
const MARKUP_OR_ENTITY_START = /[<&]+(?=[A-Za-z0-9!/?#])/g;

function normalizeUserInputWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ') // Replace horizontal whitespace with single space
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

function sanitizeUserInputOnce(input: string): string {
  // Use sanitize-html library to strip all HTML tags
  const sanitized = sanitizeHtmlLib(input, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: function (text) {
      return text;
    },
  });

  // Decode HTML entities and normalize whitespace (preserve newlines)
  return normalizeUserInputWhitespace(decodeHtmlEntities(sanitized));
}

/**
 * Sanitize user input (preserves newlines)
 *
 * Removes HTML tags while preserving newlines for user-generated content
 * like comments. Unlike sanitizeHtml, this function keeps line breaks intact.
 *
 * The result is idempotent: sanitizing it again returns it unchanged, so
 * editing and re-saving stored content does not alter it.
 *
 * @param input - User input string
 * @returns Sanitized text with preserved newlines
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return '';

  // Decoding entities can turn text back into markup (`&lt;b&gt;` -> `<b>`),
  // so repeat until a pass no longer changes the text. The pass after the
  // bound only confirms that the last change was the final one.
  let current = input;
  for (let pass = 0; pass <= MAX_USER_INPUT_PASSES; pass++) {
    const next = sanitizeUserInputOnce(current);
    if (next === current) return current;
    current = next;
  }

  // Still changing past the bound: drop only the `<` and `&` that start
  // markup or an entity, so plain text such as `a < b && c` stays
  return normalizeUserInputWhitespace(
    current.replace(MARKUP_OR_ENTITY_START, '')
  );
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

  // Pre-process: Add spaces between block elements for better text flow
  const processedHtml = html
    .replace(/<\/(p|div|li|h[1-6])>/gi, (match) => match + ' ')
    .replace(/<(p|div|li|h[1-6])([^>]*)>/gi, (match) => ' ' + match);

  // First pass: Use sanitize-html to strip all tags but preserve text content
  // This ensures no malformed or incomplete tags remain
  let cleaned = sanitizeHtmlLib(processedHtml, {
    allowedTags: [], // Remove ALL tags for text extraction
    allowedAttributes: {},
    textFilter: function (text) {
      return text;
    },
    exclusiveFilter: function (frame) {
      // Remove script and style tags completely including content
      return frame.tag === 'script' || frame.tag === 'style';
    },
  });

  // Decode HTML entities in the correct order
  cleaned = cleaned
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Process other common entities (before processing &amp;)
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...') // Three dots for compatibility
    // Process &amp; last
    .replace(/&amp;/g, '&');

  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Sanitize article HTML content for AI context
 *
 * Preserves safe formatting tags while removing dangerous elements.
 * Used for article content in Conversational Learning Coach.
 *
 * Current policy:
 * - Allowed: p, ul, ol, li, strong, em, code, pre, a, blockquote, br
 * - Removed: h1-h6, img, script, style, iframe, object
 *
 * TODO: Consider adding heading tags (h1-h3) if heading structure is needed for context.
 * TODO: Consider scheme restrictions (http/https only) via allowedSchemes config.
 * TODO: Consider internal link handling (different target policy for same-origin links).
 *
 * @param html - HTML string from article content
 * @returns Sanitized HTML with safe tags preserved
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html) return '';

  try {
    const sanitized = sanitizeHtmlLib(html, {
      allowedTags: [
        'p',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'code',
        'pre',
        'a',
        'blockquote',
        'br',
      ],
      allowedAttributes: {
        a: ['href', 'title', 'rel'],
        code: ['class'],
      },
      transformTags: {
        a: (tagName, attribs) => {
          return {
            tagName: 'a',
            attribs: {
              ...attribs,
              rel: 'nofollow noopener',
              target: '_blank',
            },
          };
        },
      },
      exclusiveFilter: (frame) => {
        return (
          frame.tag === 'script' ||
          frame.tag === 'style' ||
          frame.tag === 'iframe' ||
          frame.tag === 'object'
        );
      },
    });

    return sanitized.trim();
  } catch (_error) {
    // Fallback to text-only on sanitization failure
    return stripHtmlTags(html);
  }
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
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char] || char);
}
