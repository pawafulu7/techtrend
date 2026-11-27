import { GeminiCallTally } from '../../gemini-call-tally';
import { backfillTitleTranslation } from '../backfill-title-translation';
import {
  TitleTranslationRequestError,
  TitleTranslationUnchangedError,
  type TitleTranslator,
} from '../gemini-title-translator';

function createTranslator(
  ...results: Array<string | null | Error>
): jest.Mocked<TitleTranslator> {
  const translateTitle = jest.fn<
    ReturnType<TitleTranslator['translateTitle']>,
    Parameters<TitleTranslator['translateTitle']>
  >();
  for (const result of results) {
    if (result instanceof Error) {
      translateTitle.mockRejectedValueOnce(result);
    } else {
      translateTitle.mockResolvedValueOnce(result);
    }
  }
  return { translateTitle };
}

const input = {
  title: 'kitty 0.50.0',
  summary: '端末エミュレーターの新しい版',
  content: 'Release notes',
  requestId: 'req-1',
};

const unchanged = () =>
  new TitleTranslationUnchangedError(
    'Translation API returned invalid result: kitty 0.50.0'
  );

describe('backfillTitleTranslation', () => {
  it('訳せたら translated を返し、届いた呼び出しに数える', async () => {
    const translator = createTranslator('キティ 0.50.0');
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'translated', text: 'キティ 0.50.0' });
    expect(tally.reached).toBe(1);
    expect(tally.failed).toBe(0);
  });

  it('null（訳さない記事）は not_needed にし、呼び出しの数には入れない', async () => {
    const translator = createTranslator(null);
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'not_needed' });
    expect(tally.reached).toBe(0);
    expect(tally.failed).toBe(0);
  });

  it('原文のまま返ったら、要約なしで 1 回だけやり直し、訳せたら translated を返す', async () => {
    const translator = createTranslator(unchanged(), '訳せたタイトル');
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'translated', text: '訳せたタイトル' });

    expect(translator.translateTitle).toHaveBeenCalledTimes(2);
    expect(translator.translateTitle).toHaveBeenLastCalledWith({
      ...input,
      summary: undefined,
      requestId: 'req-1-no-summary',
    });
    expect(tally.reached).toBe(2);
  });

  it('要約あり・なしの両方で原文のままなら untranslatable を返す', async () => {
    const translator = createTranslator(unchanged(), unchanged());
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'untranslatable' });
    expect(translator.translateTitle).toHaveBeenCalledTimes(2);
    expect(tally.reached).toBe(2);
    expect(tally.failed).toBe(0);
  });

  it('要約の無い記事で原文のままなら、やり直さずに untranslatable を返す', async () => {
    const translator = createTranslator(unchanged());
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(
        translator,
        { ...input, summary: undefined },
        tally
      )
    ).resolves.toEqual({ kind: 'untranslatable' });
    expect(translator.translateTitle).toHaveBeenCalledTimes(1);
  });

  it('API に届かなかったら failed を返し、届かなかった呼び出しに数える', async () => {
    const error = new TitleTranslationRequestError('HTTP 404', 404);
    const translator = createTranslator(error);
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'failed', error });
    expect(tally.reached).toBe(0);
    expect(tally.failed).toBe(1);
    expect(tally.allFailed).toBe(true);
  });

  it('やり直しが API に届かなかったら、訳せないとは決めずに failed を返す', async () => {
    const error = new TitleTranslationRequestError('HTTP 503', 503);
    const translator = createTranslator(unchanged(), error);
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'failed', error });
    expect(tally.reached).toBe(1);
    expect(tally.failed).toBe(1);
  });

  it('応答が訳文として使えなかったら（空など）failed を返し、届いた呼び出しに数える', async () => {
    const error = new Error('Translation API returned empty result');
    const translator = createTranslator(error);
    const tally = new GeminiCallTally();

    await expect(
      backfillTitleTranslation(translator, input, tally)
    ).resolves.toEqual({ kind: 'failed', error });
    expect(tally.reached).toBe(1);
    expect(tally.failed).toBe(0);
  });
});
