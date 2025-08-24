import { GeminiClient } from './gemini';
import { LocalLLMClient } from './local-llm';
import { ExternalAPIError } from '../errors';
import { cleanSummary, cleanDetailedSummary } from '../utils/summary-cleaner';

interface AIServiceConfig {
  geminiApiKey?: string;
  localLLMUrl?: string;
  localLLMModel?: string;
  useLocalLLMFallback?: boolean;
  preferLocalLLM?: boolean;
}

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export class AIService {
  private geminiClient?: GeminiClient;
  private localLLMClient?: LocalLLMClient;
  private config: AIServiceConfig;
  private retryOptions: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  };

  constructor(config: AIServiceConfig) {
    this.config = config;

    if (config.geminiApiKey) {
      this.geminiClient = new GeminiClient(config.geminiApiKey);
    }

    if (config.localLLMUrl && config.localLLMModel) {
      this.localLLMClient = new LocalLLMClient({
        url: config.localLLMUrl,
        model: config.localLLMModel,
      });
    }
  }

  async generateSummary(title: string, content: string): Promise<string> {
    return this.executeWithFallback(
      async () => {
        if (this.config.preferLocalLLM && this.localLLMClient) {
          console.log('📟 Using Local LLM for summary generation');
          return await this.localLLMClient.generateSummary(title, content);
        } else if (this.geminiClient) {
          console.log('🌟 Using Gemini API for summary generation');
          return await this.geminiClient.generateSummary(title, content);
        } else {
          throw new Error('No AI service configured');
        }
      },
      async () => {
        if (this.config.useLocalLLMFallback && this.localLLMClient) {
          console.log('🔄 Falling back to Local LLM');
          return await this.localLLMClient.generateSummary(title, content);
        }
        throw new Error('No fallback available');
      }
    );
  }

  async generateSummaryWithTags(
    title: string,
    content: string
  ): Promise<{ summary: string; tags: string[] }> {
    return this.executeWithFallback(
      async () => {
        if (this.config.preferLocalLLM && this.localLLMClient) {
          console.log('📟 Using Local LLM for summary and tags generation');
          return await this.localLLMClient.generateSummaryWithTags(title, content);
        } else if (this.geminiClient) {
          console.log('🌟 Using Gemini API for summary and tags generation');
          return await this.geminiClient.generateSummaryWithTags(title, content);
        } else {
          throw new Error('No AI service configured');
        }
      },
      async () => {
        if (this.config.useLocalLLMFallback && this.localLLMClient) {
          console.log('🔄 Falling back to Local LLM');
          return await this.localLLMClient.generateSummaryWithTags(title, content);
        }
        throw new Error('No fallback available');
      }
    );
  }

  async generateDetailedSummary(
    title: string,
    content: string
  ): Promise<{ summary: string; detailedSummary: string; tags: string[] }> {
    const result = await this.executeWithFallback(
      async () => {
        if (this.config.preferLocalLLM && this.localLLMClient) {
          console.log('📟 Using Local LLM for detailed summary generation');
          // LocalLLMClientのgenerateDetailedSummaryメソッドを使用
          const llmResult = await this.localLLMClient.generateDetailedSummary(title, content);
          return llmResult;
        } else if (this.geminiClient) {
          console.log('🌟 Using Gemini API for detailed summary generation');
          return await this.geminiClient.generateDetailedSummary(title, content);
        } else {
          throw new Error('No AI service configured');
        }
      },
      async () => {
        if (this.config.useLocalLLMFallback && this.localLLMClient) {
          console.log('🔄 Falling back to Local LLM');
          const llmResult = await this.localLLMClient.generateDetailedSummary(title, content);
          return llmResult;
        }
        throw new Error('No fallback available');
      }
    );
    
    // 品質改善処理を適用
    const cleanedSummary = cleanSummary(result.summary);
    const cleanedDetailedSummary = cleanDetailedSummary(result.detailedSummary);
    
    // 技術的背景が不足している場合は補完
    if (!cleanedDetailedSummary.includes('記事の主題は')) {
      const lines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      if (lines.length > 0) {
        lines[0] = `・記事の主題は、${cleanedSummary}に関する技術的な実装と活用方法`;
        const updatedDetailedSummary = lines.join('\n');
        return {
          summary: cleanedSummary,
          detailedSummary: updatedDetailedSummary,
          tags: result.tags
        };
      }
    }
    
    return {
      summary: cleanedSummary,
      detailedSummary: cleanedDetailedSummary,
      tags: result.tags
    };
  }

  private async executeWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.withRetry(primaryFn);
    } catch (error) {
      if (this.shouldFallback(error)) {
        console.warn('Primary AI service failed, attempting fallback...', error);
        try {
          return await this.withRetry(fallbackFn);
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryOptions.initialDelay || 1000;

    for (let attempt = 0; attempt < (this.retryOptions.maxRetries || 3); attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < (this.retryOptions.maxRetries || 3) - 1) {
          console.log(`Retry attempt ${attempt + 1} after ${delay}ms...`);
          await this.sleep(delay);
          delay = Math.min(
            delay * (this.retryOptions.backoffMultiplier || 2),
            this.retryOptions.maxDelay || 10000
          );
        }
      }
    }

    throw lastError;
  }

  private shouldFallback(error: unknown): boolean {
    if (!this.config.useLocalLLMFallback || !this.localLLMClient) {
      return false;
    }

    // Gemini APIの503 (Service Unavailable) や 429 (Rate Limit) エラーの場合
    if (error instanceof ExternalAPIError) {
      const message = error.message.toLowerCase();
      const statusCodes = ['503', '429', 'overloaded', 'rate limit', 'unavailable'];
      return statusCodes.some(code => message.includes(code));
    }

    // ネットワークエラーの場合
    if (error instanceof Error && error.message && error.message.includes('fetch')) {
      return true;
    }

    return false;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof ExternalAPIError) {
      const message = error.message.toLowerCase();
      // 503や429はリトライ可能
      if (message.includes('503') || message.includes('429') || 
          message.includes('overloaded') || message.includes('rate limit')) {
        return true;
      }
    }
    
    // ネットワークエラーもリトライ可能
    if (error instanceof Error && error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testConnections(): Promise<{
    gemini: boolean;
    localLLM: boolean;
  }> {
    const results = {
      gemini: false,
      localLLM: false,
    };

    if (this.geminiClient) {
      try {
        await this.geminiClient.generateSummary('Test', 'Test content');
        results.gemini = true;
      } catch (error) {
        console.error('Gemini connection test failed:', error);
      }
    }

    if (this.localLLMClient) {
      try {
        const connected = await this.localLLMClient.testConnection();
        results.localLLM = connected;
      } catch (error) {
        console.error('Local LLM connection test failed:', error);
      }
    }

    return results;
  }

  static fromEnv(): AIService {
    return new AIService({
      geminiApiKey: process.env.GEMINI_API_KEY,
      localLLMUrl: process.env.LOCAL_LLM_URL,
      localLLMModel: process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b',
      useLocalLLMFallback: process.env.USE_LOCAL_LLM_FALLBACK === 'true',
      preferLocalLLM: process.env.PREFER_LOCAL_LLM === 'true',
    });
  }
}