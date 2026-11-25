import {
  captureRejectedGateAccount,
  noteRejectedGateAccount,
} from '@/lib/auth/site-gate/rejected-account-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('captureRejectedGateAccount', () => {
  it('returns the account noted inside the run, across awaits', async () => {
    const captured = await captureRejectedGateAccount(async () => {
      await tick();
      noteRejectedGateAccount('friend@gmail.com');
      return 'response';
    });
    expect(captured).toEqual({ result: 'response', email: 'friend@gmail.com' });
  });

  it('returns null when nothing was noted', async () => {
    await expect(captureRejectedGateAccount(async () => 1)).resolves.toEqual({
      result: 1,
      email: null,
    });
  });

  it('keeps concurrent requests apart', async () => {
    const [first, second, third] = await Promise.all([
      captureRejectedGateAccount(async () => {
        await tick();
        noteRejectedGateAccount('first@gmail.com');
      }),
      captureRejectedGateAccount(async () => {
        noteRejectedGateAccount('second@gmail.com');
        await tick();
      }),
      captureRejectedGateAccount(async () => {
        await tick();
      }),
    ]);
    expect(first.email).toBe('first@gmail.com');
    expect(second.email).toBe('second@gmail.com');
    expect(third.email).toBeNull();
  });

  it('does nothing outside a run (the proxy path)', () => {
    expect(() => noteRejectedGateAccount('friend@gmail.com')).not.toThrow();
  });
});
