/**
 * Comment content normalization
 *
 * Comment content is plain text: it is rendered only as React text and
 * returned as JSON, so it is stored as written (`<div>`, `a<b` and `&lt;`
 * stay) instead of being treated as HTML. Only whitespace is normalized.
 * The content is not sanitized: anything that outputs it must escape it as
 * text.
 *
 * The result is idempotent, so editing and re-saving a comment does not
 * change its content.
 */

/**
 * Normalize comment content (preserves newlines)
 *
 * @param input - Content submitted by the user
 * @returns Content with NUL removed (PostgreSQL text cannot store it),
 *   line breaks as `\n`, horizontal whitespace collapsed, at most 2
 *   consecutive newlines (whitespace-only lines count as empty), trimmed
 */
export function normalizeCommentContent(input: string): string {
  if (!input) return '';

  return input
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n') // CRLF / CR -> LF
    .replace(/[^\S\n]+/g, ' ') // Replace horizontal whitespace with single space
    .replace(/\n (?=\n)/g, '\n') // Empty out whitespace-only lines
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}
