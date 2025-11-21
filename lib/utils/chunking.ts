/**
 * Text Chunking Utility
 *
 * Provides token-aware text chunking for AI context management.
 * Uses tiktoken for accurate token counting.
 *
 * @module chunking
 */

import { get_encoding, type Tiktoken } from '@dqbd/tiktoken';

const textDecoder = new TextDecoder();

let encodingInstance: Tiktoken | null = null;

/**
 * Get or create tiktoken encoding instance
 *
 * Lazily initializes the cl100k_base encoding used by GPT-4/GPT-3.5.
 * Reuses the same instance for performance.
 *
 * @returns Tiktoken encoding instance
 */
function getEncodingInstance(): Tiktoken {
  if (!encodingInstance) {
    encodingInstance = get_encoding('cl100k_base');
  }
  if (!encodingInstance) {
    throw new Error('Failed to initialize tiktoken encoding');
  }
  return encodingInstance;
}

/**
 * Count tokens in text using tiktoken
 *
 * Falls back to character-based estimation if tiktoken fails.
 * Estimation: 1 token ≈ 4 characters (conservative estimate).
 *
 * @param text - Text to count tokens
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  try {
    const encoding = getEncodingInstance();
    return encoding.encode(text).length;
  } catch (_error) {
    // Fallback to character-based estimation
    return Math.ceil(text.length / 4);
  }
}

/**
 * Chunk interface
 */
export interface TextChunk {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  startToken: number;
  endToken: number;
}

/**
 * Chunk text by token count with overlap
 *
 * Splits text into chunks of approximately targetTokens size.
 * Adds overlapTokens of context from previous chunk to maintain continuity.
 *
 * Strategy:
 * - Encode entire text to tokens
 * - Slice tokens into chunks of targetTokens size
 * - Add overlapTokens from previous chunk
 * - Decode tokens back to text
 *
 * @param text - Text to chunk
 * @param targetTokens - Target token count per chunk (default: 1000)
 * @param overlapTokens - Overlap tokens between chunks (default: 80)
 * @returns Array of text chunks with metadata
 */
export function chunkByTokens(
  text: string,
  targetTokens: number = 1000,
  overlapTokens: number = 80
): TextChunk[] {
  if (!text) return [];

  try {
    const encoding = getEncodingInstance();
    const tokens = encoding.encode(text);
    const chunks: TextChunk[] = [];

    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < tokens.length) {
      // Calculate start position with overlap
      const startToken = Math.max(0, currentPosition - overlapTokens);
      const endToken = Math.min(tokens.length, currentPosition + targetTokens);

      // Extract chunk tokens
      const chunkTokens = tokens.slice(startToken, endToken);
      const chunkText = textDecoder.decode(encoding.decode(chunkTokens));

      chunks.push({
        chunkIndex,
        text: chunkText.trim(),
        tokenCount: chunkTokens.length,
        startToken,
        endToken,
      });

      // Move to next chunk
      currentPosition = endToken;
      chunkIndex++;
    }

    return chunks;
  } catch (_error) {
    // Fallback: Character-based chunking (4 chars ≈ 1 token)
    const targetChars = targetTokens * 4;
    const overlapChars = overlapTokens * 4;
    const chunks: TextChunk[] = [];

    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < text.length) {
      const startChar = Math.max(0, currentPosition - overlapChars);
      const endChar = Math.min(text.length, currentPosition + targetChars);

      const chunkText = text.slice(startChar, endChar);

      chunks.push({
        chunkIndex,
        text: chunkText.trim(),
        tokenCount: Math.ceil(chunkText.length / 4),
        startToken: Math.ceil(startChar / 4),
        endToken: Math.ceil(endChar / 4),
      });

      currentPosition = endChar;
      chunkIndex++;
    }

    return chunks;
  }
}

/**
 * Free tiktoken encoding resources
 *
 * Call this when the encoding instance is no longer needed
 * to free up memory.
 */
export function freeEncodingResources(): void {
  if (encodingInstance) {
    encodingInstance.free();
    encodingInstance = null;
  }
}
