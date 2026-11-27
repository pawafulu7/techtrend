/**
 * 翻訳の補完ジョブ（scripts/scheduled/fix-missing-translations.ts）で、1 記事のタイトルを訳して結果を分類する
 */
import type { GeminiCallTally } from '../gemini-call-tally';
import {
  TitleTranslationInvalidResponseError,
  TitleTranslationUnchangedError,
  type TitleTranslator,
} from './gemini-title-translator';

type BackfillInput = Parameters<TitleTranslator['translateTitle']>[0];

export type BackfillTitleOutcome =
  /** 訳せた */
  | { kind: 'translated'; text: string }
  /** 訳さない記事（日本語の記事・翻訳が無効）。API を呼ばずに決まることがある */
  | { kind: 'not_needed' }
  /** 要約あり・なしの両方で原文のまま返った（製品名と版だけのタイトルなど） */
  | { kind: 'untranslatable' }
  /** API に届かなかった、または応答が訳文として使えなかった。次の実行でやり直す */
  | { kind: 'failed'; error: unknown };

type AttemptResult = BackfillTitleOutcome | { kind: 'unchanged' };

async function attempt(
  translator: TitleTranslator,
  input: BackfillInput,
  tally: GeminiCallTally
): Promise<AttemptResult> {
  try {
    const result = await translator.translateTitle(input);
    // null は API を呼ばずに決まることがある（日本語の記事など）ので、届いた数に入れない
    if (result === null) return { kind: 'not_needed' };
    tally.recordReached();
    // 空の訳を保存すると "translatedTitle" IS NULL から外れ、二度と補完されないので失敗にする
    if (result.trim() === '') {
      return {
        kind: 'failed',
        error: new TitleTranslationInvalidResponseError('Empty translation'),
      };
    }
    return { kind: 'translated', text: result.trim() };
  } catch (error) {
    if (error instanceof TitleTranslationUnchangedError) {
      tally.recordReached();
      return { kind: 'unchanged' };
    }
    // 応答は返ったが使えなかったものだけを「届いた」に数える。HTTP エラー・タイムアウト
    // （TitleTranslationRequestError）と、正体の分からない例外は「届かなかった」に数え、
    // 全件失敗を見逃さない側に倒す
    if (error instanceof TitleTranslationInvalidResponseError) {
      tally.recordReached();
    } else {
      tally.recordFailed();
    }
    return { kind: 'failed', error };
  }
}

/**
 * 原文のまま返ったら、要約を渡さずに 1 回だけやり直す（要約に引きずられて原文を返すことがあるため。
 * 毎時の要約で訳すときの 2 回目以降と同じ）。それでも原文のままなら、訳しようがないと決める。
 * やり直しが API に届かなかったときは決めずに失敗とし、次の実行でやり直す
 */
export async function backfillTitleTranslation(
  translator: TitleTranslator,
  input: BackfillInput,
  tally: GeminiCallTally
): Promise<BackfillTitleOutcome> {
  const first = await attempt(translator, input, tally);
  if (first.kind !== 'unchanged') return first;
  if (!input.summary) return { kind: 'untranslatable' };

  const retry = await attempt(
    translator,
    {
      ...input,
      summary: undefined,
      requestId: `${input.requestId}-no-summary`,
    },
    tally
  );
  return retry.kind === 'unchanged' ? { kind: 'untranslatable' } : retry;
}
