/**
 * Common interface for debounced functions with cancel method
 */
export interface DebouncedFunction<This, Args extends unknown[], R> {
  (this: This, ...args: Args): R;
  cancel: () => void;
}

/**
 * Debounce utility function
 * Delays function execution until after wait milliseconds have elapsed since the last time it was invoked
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced function with cancel method
 */
export function debounce<This, Args extends unknown[]>(
  func: (this: This, ...args: Args) => unknown,
  wait: number
): DebouncedFunction<This, Args, void> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: This, ...args: Args) {
    // Clear existing timeout if any
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    // Set new timeout
    timeout = setTimeout(() => {
      func.apply(this, args);
      timeout = null;
    }, wait);
  } as DebouncedFunction<This, Args, void>;

  // Add cancel method to clear pending execution
  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Debounce with immediate option - overload for immediate=true
 */
export function debounceWithImmediate<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
  wait: number,
  immediate: true
): DebouncedFunction<This, Args, R | undefined>;

/**
 * Debounce with immediate option - overload for immediate=false
 */
export function debounceWithImmediate<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
  wait: number,
  immediate: false
): DebouncedFunction<This, Args, undefined>;

/**
 * Debounce with immediate option - overload for optional immediate
 */
export function debounceWithImmediate<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
  wait: number,
  immediate?: boolean
): DebouncedFunction<This, Args, R | undefined>;

/**
 * Debounce with immediate option
 * Executes immediately on the leading edge, then debounces subsequent calls
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param immediate - Whether to execute on the leading edge
 * @returns The debounced function with cancel method. Returns the result when called with immediate=true on leading edge, undefined otherwise.
 */
export function debounceWithImmediate<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
  wait: number,
  immediate = false
): DebouncedFunction<This, Args, R | undefined> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: This, ...args: Args): R | undefined {
    let result: R | undefined;
    
    const later = () => {
      timeout = null;
      if (!immediate) {
        // 遅延実行時の戻り値は呼び出し側には返さない
        func.apply(this, args);
      }
    };

    const callNow = immediate && timeout === null;
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
    
    if (callNow) {
      result = func.apply(this, args);
    }
    
    return result;
  } as DebouncedFunction<This, Args, R | undefined>;

  // Add cancel method
  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Custom error class for debounced operations
 */
export class DebouncedError extends Error {
  readonly code = 'DEBOUNCED' as const;
  
  constructor() {
    super('Debounced');
    this.name = 'DebouncedError';
  }
}

/**
 * Type guard to check if an error is a DebouncedError
 * Handles cross-realm instances (e.g., iframes, workers)
 * 
 * @param error - The error to check
 * @returns True if the error is a DebouncedError
 */
export function isDebouncedError(error: unknown): error is DebouncedError {
  return error instanceof DebouncedError || 
    (typeof error === 'object' && 
     error !== null && 
     'code' in error && 
     (error as Record<string, unknown>).code === 'DEBOUNCED');
}

/**
 * Async debounce for Promise-returning functions
 * Ensures only the last call's promise is resolved
 * 
 * @param func - The async function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced async function with cancel method
 */
export function debounceAsync<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => Promise<R>,
  wait: number
): DebouncedFunction<This, Args, Promise<R>> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingReject: ((reason?: unknown) => void) | null = null;
  let lastCallId = 0;

  const debounced = function (this: This, ...args: Args): Promise<R> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const capturedThis = this;
    const capturedArgs = args;
    return new Promise<R>((resolve, reject) => {
      const callId = ++lastCallId;
      const localResolve = resolve;
      const localReject = reject;
      
      // Clear existing timeout
      if (timeout !== null) {
        clearTimeout(timeout);
        // Reject previous pending promise if exists
        if (pendingReject) {
          pendingReject(new DebouncedError());
          pendingReject = null;
        }
      }
      
      // Store reject for potential supersession
      pendingReject = localReject;

      // Set new timeout
      timeout = setTimeout(() => {
        const executeAsync = async () => {
          try {
            const result = await func.apply(capturedThis, capturedArgs);
            if (callId === lastCallId) {
              localResolve(result);
            }
            // superseded calls were already rejected, no need to reject again
          } catch (error) {
            if (callId === lastCallId) {
              localReject(error);
            }
            // superseded calls were already rejected, no need to reject again
          } finally {
            timeout = null;
            if (callId === lastCallId) pendingReject = null;
          }
        };
        void executeAsync();
      }, wait);
    });
  } as DebouncedFunction<This, Args, Promise<R>>;

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (pendingReject) {
      pendingReject(new DebouncedError());
      pendingReject = null;
    }
    // invalidate any in-flight resolver
    lastCallId++;
  };

  return debounced;
}

// Default export for common usage pattern
export default debounce;
