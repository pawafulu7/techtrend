/**
 * Prompt Injection Detection
 *
 * Detects common prompt injection patterns to prevent agent manipulation.
 *
 * Security layers:
 * - Pattern-based detection (regex)
 * - Query sanitization (whitespace, length)
 * - Audit logging integration
 *
 * @see CodexMCP Review: "Sanitize tool inputs (strip prompt injection attempts)"
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md
 */

/**
 * Common prompt injection patterns
 *
 * Detects attempts to:
 * - Override system instructions
 * - Inject system/assistant messages
 * - Manipulate agent behavior
 */
const INJECTION_PATTERNS = [
  // Instruction override attempts
  /ignore\s+(previous|above|all|prior)\s+instructions?/i,
  /forget\s+(everything|all|previous|prior)/i,
  /override\s+instructions?/i,
  /new\s+instructions?:/i,
  /disregard\s+(previous|all)\s+/i,

  // Role manipulation attempts
  /you\s+are\s+(now|a|no\s+longer)\s+/i,
  /act\s+as\s+(a|an)\s+/i,
  /pretend\s+to\s+be/i,
  /roleplay\s+as/i,

  // System message injection
  /system\s*:/i,
  /assistant\s*:/i,
  /\[system\]/i,
  /\[assistant\]/i,
  /<\s*\/?system\s*>/i,
  /<\s*\/?assistant\s*>/i,

  // Meta-instruction attempts
  /tell\s+me\s+your\s+(instructions|system\s+prompt|rules)/i,
  /what\s+(are\s+your|is\s+your)\s+(instructions|system\s+prompt|rules)/i,
  /reveal\s+your\s+(instructions|prompt)/i,

  // Japanese variants (日本語パターン)
  /前の指示を無視/i,
  /これまでの指示を無視/i,
  /すべての指示を忘れて/i,
  /指示を無視して/i,
  /新しい指示\s*[:：]/i,
  /あなたは今/i,
  /あなたはもはや/i,
  /として振る舞って/i,
  /として行動して/i,
  /なりすまして/i,
  /ふりをして/i,
  /システム\s*[:：]/i,
  /アシスタント\s*[:：]/i,
  /ルールを無効/i,
  /制約を無視/i,
] as const;

/**
 * Detect prompt injection attempts
 *
 * @param query - User query to check
 * @returns true if injection detected, false otherwise
 *
 * @example
 * ```typescript
 * detectPromptInjection('ignore previous instructions') // true
 * detectPromptInjection('React performance optimization') // false
 * ```
 */
export function detectPromptInjection(query: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(query));
}

/**
 * Sanitize user query
 *
 * - Trim whitespace
 * - Normalize internal whitespace (collapse multiple spaces)
 * - Enforce length limit (500 characters)
 *
 * @param query - Raw user query
 * @returns Sanitized query
 *
 * @example
 * ```typescript
 * sanitizeQuery('  multi   space  ') // 'multi space'
 * sanitizeQuery('a'.repeat(600)) // 'aaa...' (500 chars)
 * ```
 */
export function sanitizeQuery(query: string): string {
  return query
    .normalize('NFKC')     // Unicode normalization (full-width → half-width)
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .substring(0, 500);   // Enforce length limit
}

/**
 * Validate and sanitize query (combined check)
 *
 * @param query - User query
 * @returns Sanitized query if valid
 * @throws Error if injection detected
 *
 * @example
 * ```typescript
 * validateQuery('React tips') // 'React tips'
 * validateQuery('ignore instructions') // throws Error
 * ```
 */
export function validateQuery(query: string): string {
  const sanitized = sanitizeQuery(query);

  if (detectPromptInjection(sanitized)) {
    throw new Error('Invalid query: potential prompt injection detected');
  }

  if (sanitized.length === 0) {
    throw new Error('Invalid query: query cannot be empty after sanitization');
  }

  return sanitized;
}
