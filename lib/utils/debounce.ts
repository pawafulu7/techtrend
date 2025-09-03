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
  let result: R | undefined;

  const debounced = function (...args: Args): R | undefined {
    const later = () => {
      timeout = null;
      if (!immediate) {
        result = func(...args);
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
 * Async debounce for Promise-returning functions
 * Ensures only the last call's promise is resolved
 * 
 * @param func - The async function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced async function
 */
export function debounceAsync<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R>,
  wait: number
): (...args: Args) => Promise<R> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let resolvePromise: ((value: R) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;

  return function (...args: Args): Promise<R> {
    return new Promise((resolve, reject) => {
      // Clear existing timeout
      if (timeout) {
        clearTimeout(timeout);
        // Reject previous promise if exists
        if (rejectPromise) {
          rejectPromise(new Error('Debounced'));
        }
      }

      // Store resolve and reject for this promise
      resolvePromise = resolve;
      rejectPromise = reject;

      // Set new timeout
      timeout = setTimeout(async () => {
        try {
          const result = await func(...args);
          if (resolvePromise) {
            resolvePromise(result);
          }
        } catch (error) {
          if (rejectPromise) {
            rejectPromise(error);
          }
        } finally {
          timeout = null;
          resolvePromise = null;
          rejectPromise = null;
        }
      }, wait);
    });
  };
}