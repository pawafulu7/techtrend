/**
 * Calculate reading time for Japanese content (~500 chars/min)
 */
export function getReadingTime(contentLength: number): number | null {
  return contentLength > 0 ? Math.max(1, Math.ceil(contentLength / 500)) : null;
}
