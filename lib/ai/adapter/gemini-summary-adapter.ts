import { logger, sanitizeError } from '@/lib/logger';
import {
  SummaryProvider,
  SummaryProviderInput,
  SummaryProviderOutput,
} from './summary-provider.interface';
import { GeminiTransport, TransportRequest } from '../transport/gemini-transport.interface';
import { PromptBuilder } from './prompt-builder';
import { INSTRUCTION_PATTERNS } from '../constants';

type GenerationConfig = {
  temperature: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
};

export class GeminiSummaryAdapter implements SummaryProvider {
  private readonly generationConfig: GenerationConfig;

  constructor(
    private readonly transport: GeminiTransport,
    private readonly promptBuilder: PromptBuilder,
    private readonly model: string = 'gemini-2.5-flash-lite',
    generationOverrides?: Partial<GenerationConfig>
  ) {
    this.generationConfig = {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
      ...generationOverrides,
    };
  }

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
        generationConfig: this.generationConfig,
      },
      requestId: input.requestId,
      timeoutMs: 60000,
    };

    logger.debug({ title: input.title, requestId: input.requestId }, 'Summarizing article');

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

      logger.debug({ requestId }, 'Successfully parsed response');

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
      logger.error({ error: sanitizeError(err) }, 'Failed to parse response');
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
    let rejectedHeadlineDueToInstruction = false;

    for (const line of lines) {
      if (line.startsWith('要約:')) {
        currentSection = 'headline';
        const content = line.substring('要約:'.length).trim();
        const isInstruction = INSTRUCTION_PATTERNS.some(pattern => pattern.test(content));
        if (content && !isInstruction) {
          headline = content;
        } else if (content && isInstruction) {
          rejectedHeadlineDueToInstruction = true;
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
        const isInstruction = INSTRUCTION_PATTERNS.some(pattern => pattern.test(line));
        if (!isInstruction) {
          headline = line;
        } else {
          rejectedHeadlineDueToInstruction = true;
        }
      } else if (currentSection === 'detailed' && line) {
        const isBullet = /^\s*(?:・|[-*•●]|[0-9０-９]+[.)\u3001\uff0e])/.test(line);
        if (isBullet) {
          detailedLines.push(line.trimStart());
        } else if (detailedLines.length > 0 && !/^\s*$/.test(line)) {
          // Merge continuation lines into the last bullet item
          const lastIndex = detailedLines.length - 1;
          detailedLines[lastIndex] += ' ' + line.trim();
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
      if (rejectedHeadlineDueToInstruction) {
        throw new Error('Headline contains instruction markers - regeneration required');
      }
      throw new Error('Failed to extract headline from response');
    }

    if (!detailedSummary) {
      throw new Error('Failed to extract detailed summary from response');
    }

    if (this.containsInstructionMarkers(headline)) {
      logger.warn({ headline: headline.substring(0, 100) }, 'Headline contains instruction markers, rejecting');
      throw new Error('Headline contains instruction markers - regeneration required');
    }

    if (this.containsInstructionMarkers(detailedSummary)) {
      logger.warn('Detailed summary contains instruction markers, rejecting');
      throw new Error('Detailed summary contains instruction markers - regeneration required');
    }

    return {
      headline,
      detailedSummary,
      category,
      tags,
    };
  }

  private containsInstructionMarkers(text: string): boolean {
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine))) {
        return true;
      }

      if (
        /^\[ここに.*\]$/.test(trimmedLine) ||
        trimmedLine === '-' ||
        /^文字数[:：]/.test(trimmedLine)
      ) {
        return true;
      }
    }

    return false;
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