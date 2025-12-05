/**
 * Server-Timing Header Utility
 *
 * Provides standardized Server-Timing header generation for API responses
 * Follows the Server-Timing specification: https://www.w3.org/TR/server-timing/
 */

export interface TimingEntry {
  name: string;
  duration: number;
  description?: string;
}

/**
 * Generate Server-Timing header value from timing entries
 */
export function generateServerTimingHeader(entries: TimingEntry[]): string {
  return entries
    .map((entry) => {
      let value = `${entry.name};dur=${entry.duration.toFixed(2)}`;
      if (entry.description) {
        value += `;desc="${entry.description}"`;
      }
      return value;
    })
    .join(', ');
}

/**
 * Helper class to collect timing measurements and generate Server-Timing header
 */
export class ServerTimingCollector {
  private entries: TimingEntry[] = [];
  private activeTimers: Map<string, number> = new Map();
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Start timing an operation
   */
  start(name: string): void {
    this.activeTimers.set(name, performance.now());
  }

  /**
   * End timing an operation and record the duration
   */
  end(name: string, description?: string): number {
    const startTime = this.activeTimers.get(name);
    if (startTime === undefined) {
      return 0;
    }

    const duration = performance.now() - startTime;
    this.entries.push({ name, duration, description });
    this.activeTimers.delete(name);
    return duration;
  }

  /**
   * Add a timing entry directly (for pre-calculated durations)
   */
  add(name: string, duration: number, description?: string): void {
    this.entries.push({ name, duration, description });
  }

  /**
   * Get total elapsed time since collector creation
   */
  getTotalTime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Generate the Server-Timing header value
   */
  getHeader(): string {
    // Add total time as the last entry
    const allEntries = [
      ...this.entries,
      { name: 'total', duration: this.getTotalTime(), description: 'Total Time' },
    ];
    return generateServerTimingHeader(allEntries);
  }

  /**
   * Apply Server-Timing header to a Headers object
   */
  applyToHeaders(headers: Headers): void {
    headers.set('Server-Timing', this.getHeader());
  }

  /**
   * Get all recorded entries
   */
  getEntries(): TimingEntry[] {
    return [...this.entries];
  }
}

/**
 * Measure async function execution time
 */
export async function measureAsync<T>(
  collector: ServerTimingCollector,
  name: string,
  fn: () => Promise<T>,
  description?: string
): Promise<T> {
  collector.start(name);
  try {
    return await fn();
  } finally {
    collector.end(name, description);
  }
}

/**
 * Create a standard API response with Server-Timing header
 */
export function createTimedResponse<T>(
  collector: ServerTimingCollector,
  data: T,
  status = 200
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  collector.applyToHeaders(headers);

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}
