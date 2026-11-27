import { GeminiCallTally } from '../gemini-call-tally';

describe('GeminiCallTally', () => {
  it('応答が返った呼び出しを reached に数え、結果をそのまま返す', async () => {
    const tally = new GeminiCallTally();

    await expect(tally.track(async () => 'ok')).resolves.toBe('ok');

    expect(tally.reached).toBe(1);
    expect(tally.failed).toBe(0);
  });

  it('例外が出た呼び出しを failed に数え、例外をそのまま投げ直す', async () => {
    const tally = new GeminiCallTally();
    const error = new Error('HTTP 404');

    await expect(
      tally.track(async () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(tally.reached).toBe(0);
    expect(tally.failed).toBe(1);
  });

  it('1 件も届かずに失敗だけが出たときだけ allFailed になる', async () => {
    const fail = () => Promise.reject(new Error('HTTP 404'));

    const allFailed = new GeminiCallTally();
    await allFailed.track(fail).catch(() => undefined);
    await allFailed.track(fail).catch(() => undefined);
    expect(allFailed.allFailed).toBe(true);

    const mixed = new GeminiCallTally();
    await mixed.track(fail).catch(() => undefined);
    await mixed.track(async () => 'ok');
    expect(mixed.allFailed).toBe(false);

    // 呼び出しが無かった回（対象 0 件）は失敗にしない
    expect(new GeminiCallTally().allFailed).toBe(false);
  });

  it('summary は件数だけを出す', async () => {
    const tally = new GeminiCallTally();
    await tally.track(async () => 'ok');
    await tally
      .track(() => Promise.reject(new Error('x')))
      .catch(() => undefined);

    expect(tally.summary()).toBe(
      'gemini_calls_reached=1 gemini_calls_failed=1'
    );
  });
});
