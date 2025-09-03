/**
 * Debounce utility function
 * Delays function execution until after wait milliseconds have elapsed since the last time it was invoked
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced function
 */
export function debounce<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number
): ((...args: Args) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (...args: Args) {
    // Clear existing timeout if any
    if (timeout) {
      clearTimeout(timeout);
    }

    // Set new timeout
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };

  // Add cancel method to clear pending execution
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Debounce with immediate option
 * Executes immediately on the leading edge, then debounces subsequent calls
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param immediate - Whether to execute on the leading edge
 * @returns The debounced function with cancel method
 */
export function debounceWithImmediate<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number,
  immediate = false
): ((...args: Args) => R | undefined) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (...args: Args): R | undefined {
    let result: R | undefined;
    
    const later = () => {
      timeout = null;
      if (!immediate) {
        // 遅延実行時の戻り値は呼び出し側には返さない
        func(...args);
      }
    };

    const callNow = immediate && !timeout;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
    
    if (callNow) {
      result = func(...args);
    }
    
    return result;
  };

  // Add cancel method
  debounced.cancel = () => {
    if (timeout) {
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
  constructor() {
    super('Debounced');
    this.name = 'DebouncedError';
  }
}

/**
 * Async debounce for Promise-returning functions
 * Ensures only the last call's promise is resolved
 * 
 * @param func - The async function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced async function with cancel method
 */
export function debounceAsync<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R>,
  wait: number
): ((...args: Args) => Promise<R>) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingReject: ((reason?: unknown) => void) | null = null;
  let lastCallId = 0;

  const debounced: ((...args: Args) => Promise<R>) & { cancel: () => void } = ((...args: Args): Promise<R> => {
    return new Promise((resolve, reject) => {
      const callId = ++lastCallId;
      const localResolve = resolve;
      const localReject = reject;
      
      // Clear existing timeout
      if (timeout) {
        clearTimeout(timeout);
        // Reject previous pending promise if exists
        if (pendingReject) pendingReject(new DebouncedError());
      }
      
      // Store reject for potential supersession
      pendingReject = localReject;

      // Set new timeout
      timeout = setTimeout(async () => {
        try {
          const result = await func(...args);
          if (callId === lastCallId) localResolve(result);
          else localReject(new DebouncedError());
        } catch (error) {
          if (callId === lastCallId) localReject(error);
        } finally {
          timeout = null;
          if (callId === lastCallId) pendingReject = null;
        }
      }, wait);
    });
  }) as ((...args: Args) => Promise<R>) & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout) {
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