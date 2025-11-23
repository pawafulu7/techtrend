const DEFAULT_TIMEOUT_MS = 30_000;

// Certain upstream sources are consistently slower; give them more room before aborting.
export const SOURCE_TIMEOUT_MAP: Record<string, number> = {
  'Hugging Face Papers': 60_000,
  'arXiv AI': 60_000,
};

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  sourceName?: string;
}

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

export function getTimeoutForSource(sourceName?: string, overrideTimeoutMs?: number): number {
  if (typeof overrideTimeoutMs === 'number') {
    return overrideTimeoutMs;
  }
  if (sourceName && SOURCE_TIMEOUT_MAP[sourceName]) {
    return SOURCE_TIMEOUT_MAP[sourceName];
  }
  return DEFAULT_TIMEOUT_MS;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs, sourceName, signal, ...init } = options;
  const timeout = getTimeoutForSource(sourceName, timeoutMs);
  const controller = new AbortController();

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    const isAbortError =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError');

    if (isAbortError && timedOut) {
      // Distinguish timeouts from other abort reasons to aid troubleshooting.
      throw new FetchTimeoutError(`Fetch timed out after ${timeout}ms${sourceName ? ` for ${sourceName}` : ''}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
