export function measureQueryTime(queryName: string) {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      console.error(`Query ${queryName} took ${duration}ms`);
      return duration;
    }
  };
}

export function logPerformance(operation: string, duration: number) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Performance - ${operation}: ${duration}ms`);
}