import { GeminiTransport } from '../transport/gemini-transport.interface';

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
    if (!translated || translated.toLowerCase() === 'unchanged' || translated === '翻訳不要') {
      return null;
    }

    return translated;
  }

  private isLikelyJapanese(text: string): boolean {
    return GeminiTitleTranslator.JAPANESE_CHAR_PATTERN.test(text);
  }

  private buildPrompt(title: string, summary?: string): string {
    const parts = [
      'You are a professional technical translator specializing in software engineering content.',
      'You will translate the given English technical article title into natural, contextually appropriate Japanese.',
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
      parts.push('Important: The context/summary language does NOT affect whether you should translate.');
      parts.push('Always translate the title if it is in English, regardless of the context language.');
      parts.push('');
    }

    parts.push('Title Check:');
    parts.push('- Consider ONLY the line that starts with "Title to translate:"');
    parts.push('- If that title already contains Japanese characters, output exactly "UNCHANGED"');
    parts.push('- Otherwise, translate the title into Japanese');
    parts.push('');
    parts.push('Output Format:');
    parts.push('- Output ONLY the translated title (one line)');
    parts.push('- No quotes, no explanations, no extra text');
    parts.push('');
    parts.push(`Title to translate: ${title}`);

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
