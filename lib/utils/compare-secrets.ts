import { timingSafeEqual, createHash } from 'crypto';

/**
 * Timing-safe secret comparison.
 * Uses SHA-256 hashing to ensure constant-time comparison regardless of input lengths.
 */
export function compareSecrets(a: string, b: string): boolean {
  try {
    const hashA = createHash('sha256').update(a, 'utf8').digest();
    const hashB = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}
