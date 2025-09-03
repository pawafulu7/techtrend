/**
 * Debounce utility function
 * Delays function execution until after wait milliseconds have elapsed since the last time it was invoked
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounceWithImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;

  const debounced = function (...args: Parameters<T>) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolvePromise: ((value: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rejectPromise: ((reason?: any) => void) | null = null;

  return function (...args: Parameters<T>): Promise<ReturnType<T>> {
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