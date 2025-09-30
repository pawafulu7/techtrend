import {
  SummaryProvider,
  SummaryProviderInput,
  SummaryProviderOutput,
} from './summary-provider.interface';
import { GeminiTransport, TransportRequest } from '../transport/gemini-transport.interface';
import { PromptBuilder } from './prompt-builder';

export class GeminiSummaryAdapter implements SummaryProvider {
  constructor(
    private readonly transport: GeminiTransport,
    private readonly promptBuilder: PromptBuilder,
    private readonly model: string = 'gemini-1.5-flash'
  ) {}

  async summarize(input: SummaryProviderInput): Promise<SummaryProviderOutput> {
    const prompt = this.promptBuilder.buildPrompt(input);

    const transportRequest: TransportRequest = {
      model: this.model,
      body: {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      },
      requestId: input.requestId,
      timeoutMs: 60000,
    };

    console.log(`[Adapter] Summarizing article: ${input.title} (${input.requestId})`);

    const result = await this.transport.invoke(transportRequest);

    if (result.status === 'ok' && result.payload) {
      return this.parseResponse(result.payload, input.requestId);
    }

    if (result.status === 'retryable_error') {
      throw new Error(`Retryable error during summarization: ${result.error?.message || 'Unknown error'}`);
    }

    throw new Error(`Fatal error during summarization: ${result.error?.message || 'Unknown error'}`);
  }

  private parseResponse(payload: Record<string, unknown>, requestId: string): SummaryProviderOutput {
    try {
      const candidates = payload.candidates as Array<Record<string, unknown>>;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates in response');
      }

      const candidate = candidates[0];
      const content = candidate.content as Record<string, unknown>;
      if (!content) {
        throw new Error('No content in candidate');
      }

      const parts = content.parts as Array<Record<string, unknown>>;
      if (!parts || parts.length === 0) {
        throw new Error('No parts in content');
      }

      const text = parts[0].text as string;
      if (!text) {
        throw new Error('No text in parts');
      }

      const parsed = this.extractStructuredData(text);

      console.log(`[Adapter] Successfully parsed response for ${requestId}`);

      return {
        headline: parsed.headline,
        detailedSummary: parsed.detailedSummary,
        category: parsed.category,
        tags: parsed.tags,
        confidence: this.calculateConfidence(candidate),
        rawResponse: payload,
      };
    } catch (error) {
      const err = error as Error;
      console.error(`[Adapter] Failed to parse response: ${err.message}`);
      throw new Error(`Response parsing failed: ${err.message}`);
    }
  }

  private extractStructuredData(text: string): {
    headline: string;
    detailedSummary: string;
    category?: string;
    tags?: string[];
  } {
    const lines = text.split('\n').map((line) => line.trim());

    let headline = '';
    let detailedSummary = '';
    let category: string | undefined;
    let tags: string[] | undefined;

    let currentSection = '';
    const detailedLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('要約:')) {
        currentSection = 'headline';
        const content = line.substring('要約:'.length).trim();
        if (content) {
          headline = content;
        }
        continue;
      }

      if (line.startsWith('詳細要約:')) {
        currentSection = 'detailed';
        continue;
      }

      if (line.startsWith('カテゴリ:')) {
        currentSection = 'category';
        const content = line.substring('カテゴリ:'.length).trim();
        if (content && content !== '以下から1つ選択してください：') {
          category = content;
        }
        continue;
      }

      if (line.startsWith('タグ:')) {
        currentSection = 'tags';
        const content = line.substring('タグ:'.length).trim();
        if (content) {
          tags = content.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
        }
        continue;
      }

      if (line.startsWith('【') || line === '') {
        continue;
      }

      if (currentSection === 'headline' && !headline) {
        headline = line;
      } else if (currentSection === 'detailed' && line) {
        const isBullet = /^\s*(?:・|[-*•●]|[0-9０-９]+[.)\u3001\uff0e])/.test(line);
        if (isBullet) {
          detailedLines.push(line.trimStart());
        } else if (detailedLines.length > 0) {
          detailedLines.push(line);
        }
      } else if (currentSection === 'category' && !category && line) {
        category = line;
      } else if (currentSection === 'tags' && !tags && line) {
        tags = line.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      }
    }

    if (detailedLines.length > 0) {
      detailedSummary = detailedLines.join('\n');
    }

    if (!headline) {
      throw new Error('Failed to extract headline from response');
    }

    if (!detailedSummary) {
      throw new Error('Failed to extract detailed summary from response');
    }

    return {
      headline,
      detailedSummary,
      category,
      tags,
    };
  }

  private calculateConfidence(candidate: Record<string, unknown>): number {
    const finishReason = candidate.finishReason as string;

    if (finishReason === 'STOP') {
      return 0.95;
    }

    if (finishReason === 'MAX_TOKENS') {
      return 0.7;
    }

    return 0.5;
  }
}