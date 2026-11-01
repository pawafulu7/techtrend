/**
 * runWithTimeout: 処理に時間の上限を付ける
 */
import { runWithTimeout } from '@/scripts/scheduled/utils/run-with-timeout';

describe('runWithTimeout', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('上限までに終われば結果を返す', async () => {
    await expect(runWithTimeout(async () => 'ok', 1000, 'timeout')).resolves.toBe('ok');
  });

  it('上限を過ぎると timeoutMessage で reject し、signal を中断する', async () => {
    jest.useFakeTimers();
    let received: AbortSignal | undefined;
    const pending = runWithTimeout(
      (signal) => {
        received = signal;
        return new Promise<never>(() => {});
      },
      100,
      'took too long'
    );
    const assertion = expect(pending).rejects.toThrow('took too long');

    await jest.advanceTimersByTimeAsync(100);
    await assertion;
    expect(received?.aborted).toBe(true);
  });

  it('処理が失敗したらそのエラーで reject する', async () => {
    await expect(
      runWithTimeout(async () => {
        throw new Error('boom');
      }, 1000, 'timeout')
    ).rejects.toThrow('boom');
  });
});
