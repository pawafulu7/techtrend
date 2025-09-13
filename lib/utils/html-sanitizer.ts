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
    allowedTags: [],  // Remove all tags
    allowedAttributes: {},  // Remove all attributes
    textFilter: function(text) {
      return text;  // Keep text content
    },
    exclusiveFilter: function(frame) {
      // Remove script and style tags completely including content
      return frame.tag === 'script' || frame.tag === 'style';
    }
  });

  // Clean up whitespace
  return result
    .replace(/\s+/g, ' ')
    .trim();
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
    allowedTags: [],  // Remove all HTML tags for text-only output
    allowedAttributes: {},
    textFilter: function(text) {
      return text;
    }
  });

  // Decode HTML entities safely and clean whitespace
  return decodeHtmlEntities(sanitized)
    .replace(/\s+/g, ' ')
    .trim();
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

  // Use sanitize-html library to remove dangerous tags but preserve text structure
  let cleaned = sanitizeHtmlLib(html, {
    allowedTags: ['p', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol'],
    allowedAttributes: {},
    textFilter: function(text) {
      return text;
    },
    exclusiveFilter: function(frame) {
      // Remove script and style tags completely including content
      return frame.tag === 'script' || frame.tag === 'style';
    }
  });

  // Convert block elements to spaces for better text flow
  cleaned = cleaned
    .replace(/<\/?(div|p|br|li|tr|h[1-6])[^>]*>/gi, ' ')
    .replace(/<\/?(ul|ol|table|thead|tbody|tfoot)[^>]*>/gi, ' ');

  // Remove any remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

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
    .replace(/&hellip;/g, '...')  // Three dots for compatibility
    // Process &amp; last
    .replace(/&amp;/g, '&');

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