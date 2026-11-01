/**
 * 処理に時間の上限を付ける
 *
 * 上限を過ぎると、渡した AbortSignal を中断し、timeoutMessage のエラーで reject する。
 * signal を受け取らない処理でも、Promise.race で待つのをやめる（処理そのものは止まらない）。
 */
export async function runWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`[TIMEOUT] ${timeoutMessage}`);
      controller.abort(new Error(timeoutMessage));
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    // Call the task in a microtask so the timeout is armed even if the task body
    // does heavy synchronous work before its first await.
    const taskPromise = Promise.resolve().then(() => task(controller.signal));
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
