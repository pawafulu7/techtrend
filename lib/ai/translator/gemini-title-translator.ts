import { GeminiTransport } from '../transport/gemini-transport.interface';
import {
  isLikelyJapanese,
  isLikelyJapaneseBody,
} from '@/lib/utils/language-detection';

type TitleTranslationInput = {
  title: string;
  summary?: string;
  /** 記事の本文。日本語なら英語のタイトルでも訳さない（issue #725） */
  content?: string;
  requestId: string;
};

export interface TitleTranslator {
  translateTitle(input: TitleTranslationInput): Promise<string | null>;
}

type TranslatorOptions = {
  enabled: boolean;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
};

/**
 * API の呼び出しそのものが失敗した（HTTP エラー・タイムアウト・回路の遮断）。
 * 応答は返ったが訳文として使えない場合（原文のまま・空）とは分けて数えられるようにする。
 * status と cause の種類は summarizeError がログに出す
 * （例: `TitleTranslationRequestError status=404 <- cause: Error`、タイムアウトなら cause が AbortError）
 */
export class TitleTranslationRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'TitleTranslationRequestError';
    this.status = status;
  }
}

/**
 * 応答は返ったが、英語のタイトルが原文のまま（または UNCHANGED・翻訳不要）だった。
 * 製品名と版だけのタイトル（例: "kitty 0.50.0"）のように訳しようがない場合に多い
 */
export class TitleTranslationUnchangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TitleTranslationUnchangedError';
  }
}

/**
 * 応答は返ったが、訳文として使えなかった（本文が無い・空・安全性のフィルタで止められたなど）。
 * API に届かなかった失敗（TitleTranslationRequestError）と分けて数えられるようにする。
 * 安全性のフィルタで止められたときは、理由（PROHIBITED_CONTENT など）を code に持つ。
 * code は summarizeError がログに出す
 */
export class TitleTranslationInvalidResponseError extends Error {
  readonly code?: string;

  constructor(message: string, blockReason?: string) {
    super(message);
    this.name = 'TitleTranslationInvalidResponseError';
    this.code = blockReason;
  }

  /** 安全性のフィルタで止められた（同じタイトルは何度送っても止められることが多い） */
  get blocked(): boolean {
    return this.code !== undefined;
  }
}

// 本文が無いときに、安全性のフィルタで止められたとみなす終了理由
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'LANGUAGE',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
]);

/** 理由の値を、決まった形（大文字・数字・_）のときだけ返す（公開されるログに出すため） */
function safeReason(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Z0-9_]{1,32}$/.test(value)
    ? value
    : undefined;
}

// 比べる前に外す、前後の引用符・かぎ括弧（プロンプトがタイトルを引用符で囲むので、付けて返すことがある）
const SURROUNDING_QUOTES = /^["'“”‘’＂「『【]+|["'“”‘’＂」』】]+$/g;

function stripQuotes(text: string): string {
  return text.trim().replace(SURROUNDING_QUOTES, '').trim();
}

/**
 * 訳文が原文と同じか。前後の空白・引用符・かぎ括弧と、大文字小文字の違いは無視する
 * （「Colorfigures」や darktable のように、原文に近い形で返っても訳せていないため）
 */
function isSameAsOriginal(translated: string, original: string): boolean {
  return (
    stripQuotes(translated).toLowerCase() === stripQuotes(original).toLowerCase()
  );
}

export class GeminiTitleTranslator implements TitleTranslator {
  constructor(
    private readonly transport: GeminiTransport,
    private readonly options: TranslatorOptions
  ) {}

  async translateTitle(input: TitleTranslationInput): Promise<string | null> {
    if (!this.options.enabled) {
      return null;
    }

    if (isLikelyJapanese(input.title)) {
      return null;
    }

    // 英語のタイトルを付けた日本語の記事。訳すと「英語から自動翻訳」と表示されてしまう
    if (isLikelyJapaneseBody(input.content)) {
      return null;
    }

    const prompt = this.buildPrompt(input.title, input.summary);
    const requestId = `${input.requestId}-title-translation`;

    const result = await this.transport.invoke({
      model: this.options.model,
      requestId,
      timeoutMs: 20000,
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: this.options.temperature,
          topP: this.options.topP,
          topK: this.options.topK,
          maxOutputTokens: this.options.maxOutputTokens,
        },
      },
    });

    if (result.status !== 'ok') {
      throw new TitleTranslationRequestError(
        result.error?.message ?? 'Translation failed',
        result.httpStatus,
        result.error
      );
    }

    if (!result.payload) {
      throw new TitleTranslationInvalidResponseError('Translation failed');
    }

    const translated = this.extractTranslation(result.payload);

    if (!translated || translated.trim() === '') {
      throw new TitleTranslationInvalidResponseError(
        'Translation API returned empty result'
      );
    }

    // UNCHANGED・翻訳不要が返った場合と、英語のタイトルが原文のまま返った場合
    // （製品名と版だけなど、訳しようがないことが多い）。引用符で囲んで返すことがあるので外して比べる。
    // 日本語のタイトルは最初に null を返しているので、ここに来るのは英語のタイトルだけ
    const normalizedTranslated = translated.trim();
    const bare = stripQuotes(normalizedTranslated).toLowerCase();
    if (
      bare === 'unchanged' ||
      bare === '翻訳不要' ||
      isSameAsOriginal(normalizedTranslated, input.title)
    ) {
      throw new TitleTranslationUnchangedError(
        `Translation API returned invalid result: ${normalizedTranslated}`
      );
    }

    return normalizedTranslated;
  }

  private buildPrompt(title: string, summary?: string): string {
    const parts = [
      'You are a professional technical translator specializing in software engineering content.',
      '',
      'TASK: The title below is in English and contains no Japanese characters.',
      'You MUST translate it into natural Japanese.',
      '',
      'Translation Guidelines:',
      '- Understand the context and intended message of the title',
      '- If the title references pop culture, wordplay, or idioms, acknowledge it and convey the nuance',
      '- Prioritize clarity and the intended takeaway over literal translation',
      '- Keep product names, project names, and company names in their original form (e.g., React, GitHub, AWS)',
      '- Retain common technical abbreviations (API, LLM, GPU, AI, ML, etc.)',
      '- Use natural Japanese phrasing that tech professionals would immediately understand',
      '- Keep the tone punchy and headline-like',
      '',
    ];

    if (summary) {
      parts.push('Context (article summary - for reference only):');
      parts.push(summary);
      parts.push('');
    }

    parts.push('CRITICAL INSTRUCTIONS:');
    parts.push('DO NOT output the original English title');
    parts.push('DO NOT output the word "UNCHANGED"');
    parts.push('DO NOT output "翻訳不要" or similar phrases');
    parts.push('DO NOT add quotes or explanations');
    parts.push('');
    parts.push('OUTPUT FORMAT:');
    parts.push('Reply with exactly one line: the Japanese translation');
    parts.push('Nothing else');
    parts.push('');
    parts.push(`Title: "${title}"`);

    return parts.join('\n');
  }

  private extractTranslation(payload: Record<string, unknown>): string {
    const candidates = payload.candidates as
      Array<Record<string, unknown>> | undefined;
    if (!candidates?.length) {
      // 安全性のフィルタで依頼が止められると、候補が 1 件も返らない（promptFeedback.blockReason）
      const feedback = payload.promptFeedback as
        Record<string, unknown> | undefined;
      throw new TitleTranslationInvalidResponseError(
        'No candidates in response',
        safeReason(feedback?.blockReason)
      );
    }

    const content = candidates[0]?.content as
      Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const raw: unknown = parts?.[0]?.text;

    if (typeof raw !== 'string' || raw === '') {
      // 出力の途中で安全性のフィルタに止められると、終了理由が SAFETY などになって本文が無い
      const finishReason = safeReason(candidates[0]?.finishReason);
      throw new TitleTranslationInvalidResponseError(
        'No text returned from translator',
        finishReason && BLOCKED_FINISH_REASONS.has(finishReason)
          ? finishReason
          : undefined
      );
    }

    return raw.trim();
  }
}
