export function measureQueryTime(_queryName: string) {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      return duration;
    }
  };
}

export function logPerformance(_operation: string, _duration: number) {
  const _timestamp = new Date().toISOString();
}