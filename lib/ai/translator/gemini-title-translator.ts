import { GeminiTransport } from '../transport/gemini-transport.interface';

type TitleTranslationInput = {
  title: string;
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
  private static readonly JAPANESE_CHAR_PATTERN =
    /[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/;

  constructor(
    private readonly transport: GeminiTransport,
    private readonly options: TranslatorOptions
  ) {}

  async translateTitle(input: TitleTranslationInput): Promise<string | null> {
    if (!this.options.enabled) {
      return null;
    }

    if (this.isLikelyJapanese(input.title)) {
      return null;
    }

    const prompt = this.buildPrompt(input.title);
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
    if (!translated || translated.toLowerCase() === 'unchanged' || translated === '翻訳不要') {
      return null;
    }

    return translated;
  }

  private isLikelyJapanese(text: string): boolean {
    return GeminiTitleTranslator.JAPANESE_CHAR_PATTERN.test(text);
  }

  private buildPrompt(title: string): string {
    return [
      'You are a professional technical translator.',
      'Translate the given English technical article title into natural Japanese.',
      'Follow the rules:',
      '- Keep product or project names in their original form.',
      '- Retain common abbreviations such as API, LLM, or GPU.',
      '- Output only the translated title without quotes or extra text.',
      '- If the input is already Japanese, output exactly "UNCHANGED".',
      '',
      `Title: ${title}`,
    ].join('\n');
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
