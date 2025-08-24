export function measureQueryTime(queryName: string) {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      return duration;
    }
  };
}

export function logPerformance(operation: string, duration: number) {
  const timestamp = new Date().toISOString();
}