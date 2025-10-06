import { GeminiTransport } from '../transport/gemini-transport.interface';
import { isLikelyJapanese } from '@/lib/utils/language-detection';

type TitleTranslationInput = {
  title: string;
  summary?: string;
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

    if (result.status !== 'ok' || !result.payload) {
      throw new Error(result.error?.message ?? 'Translation failed');
    }

    const translated = this.extractTranslation(result.payload);

    if (!translated || translated.trim() === '') {
      throw new Error('Translation API returned empty result');
    }

    // UNCHANGEDまたは原文がそのまま返された場合のハンドリング
    const normalizedTranslated = translated.trim();
    if (normalizedTranslated.toLowerCase() === 'unchanged' ||
        normalizedTranslated === '翻訳不要') {
      throw new Error(`Translation API returned invalid result: ${normalizedTranslated}`);
    }

    // 原文がそのまま返された場合、日本語タイトルかチェック
    if (normalizedTranslated === input.title.trim()) {
      if (isLikelyJapanese(normalizedTranslated)) {
        // Japanese title detected - skip translation (normal behavior)
        return null;
      }
      // English title returned unchanged - API error
      throw new Error(`Translation API returned invalid result: ${normalizedTranslated}`);
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
    const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
    if (!candidates?.length) {
      throw new Error('No candidates in response');
    }

    const content = candidates[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const raw = parts?.[0]?.text as string | undefined;

    if (!raw) {
      throw new Error('No text returned from translator');
    }

    return raw.trim();
  }
}
