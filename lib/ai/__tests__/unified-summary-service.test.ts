import fetch from 'node-fetch';
import { UnifiedSummaryService } from '../unified-summary-service';
import * as articleTypePrompts from '../../utils/article-type-prompts';
import * as unifiedSummaryParser from '../unified-summary-parser';
import * as summaryQualityChecker from '../../utils/summary-quality-checker';

jest.mock('node-fetch');
jest.mock('../../utils/article-type-prompts');
jest.mock('../unified-summary-parser');
jest.mock('../../utils/summary-quality-checker');

describe('UnifiedSummaryService', () => {
  let service: UnifiedSummaryService;
  const mockApiKey = 'test-api-key';
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
  const mockGeneratePrompt = articleTypePrompts.generateEnhancedUnifiedPrompt as jest.Mock;
  const mockParseResponse = unifiedSummaryParser.parseUnifiedResponse as jest.Mock;
  const mockValidateResult = unifiedSummaryParser.validateParsedResult as jest.Mock;
  const mockCheckQuality = summaryQualityChecker.checkSummaryQuality as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = mockApiKey;
    service = new UnifiedSummaryService();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  describe('constructor', () => {
    it('should initialize with API key from environment', () => {
      expect(() => new UnifiedSummaryService()).not.toThrow();
    });

    it('should initialize with provided API key', () => {
      expect(() => new UnifiedSummaryService('custom-key')).not.toThrow();
    });

    it('should throw error when no API key is available', () => {
      delete process.env.GEMINI_API_KEY;
      expect(() => new UnifiedSummaryService()).toThrow('GEMINI_API_KEY is not set');
    });
  });

  describe('generate', () => {
    const mockTitle = 'Test Article';
    const mockContent = 'This is a test article content that discusses various topics. '.repeat(10); // Make it longer than 500 chars
    const mockResponse = {
      summary: 'Test summary',
      detailedSummary: 'Detailed test summary',
      tags: ['test', 'article'],
      category: undefined
    };

    beforeEach(() => {
      mockGeneratePrompt.mockReturnValue('test prompt');
      mockParseResponse.mockReturnValue(mockResponse);
      mockValidateResult.mockReturnValue(true);
      mockCheckQuality.mockReturnValue({ 
        score: 80, 
        issues: [],
        passed: true
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockResponse) }]
            }
          }]
        })
      } as Response);
    });

    it('should generate summary successfully', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      expect(result).toEqual({
        ...mockResponse,
        articleType: 'unified',
        summaryVersion: 8,
        qualityScore: 80
      });
      
      expect(mockGeneratePrompt).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
      expect(mockParseResponse).toHaveBeenCalled();
      expect(mockValidateResult).toHaveBeenCalled();
      expect(mockCheckQuality).toHaveBeenCalled();
    });

    it('should handle source info when provided', async () => {
      const sourceInfo = { 
        sourceName: 'Test Source', 
        url: 'https://example.com' 
      };
      
      await service.generate(mockTitle, mockContent, {}, sourceInfo);
      
      // sourceInfo is used for preprocessing, not directly in the prompt
      expect(mockGeneratePrompt).toHaveBeenCalledWith(
        mockTitle,
        expect.any(String)
      );
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should retry on API failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify(mockResponse) }]
              }
            }]
          })
        } as Response);

      const result = await service.generate(mockTitle, mockContent, { maxRetries: 2 });
      
      expect(result).toEqual({
        ...mockResponse,
        articleType: 'unified',
        summaryVersion: 8,
        qualityScore: 80
      });
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      // Clear the previous mock setup and set up rejection
      mockFetch.mockReset();
      mockFetch.mockRejectedValue(new Error('API Error'));
      
      await expect(
        service.generate(mockTitle, mockContent, { maxRetries: 2 })
      ).rejects.toThrow('Failed to generate summary after 2 attempts');
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle low quality score', async () => {
      mockCheckQuality.mockReturnValue({ 
        score: 30, 
        issues: ['Too short'],
        passed: false
      });
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify(mockResponse) }]
              }
            }]
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  ...mockResponse,
                  summary: 'Improved summary'
                }) }]
              }
            }]
          })
        } as Response);
      
      mockCheckQuality
        .mockReturnValueOnce({ score: 30, issues: ['Too short'], passed: false })
        .mockReturnValueOnce({ score: 75, issues: [], passed: true });
      
      const result = await service.generate(mockTitle, mockContent, { 
        minQualityScore: 70,
        maxRetries: 2
      });
      
      expect(result.qualityScore).toBe(75);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle parsing error', async () => {
      mockParseResponse.mockImplementation(() => {
        throw new Error('Parse error');
      });
      
      await expect(
        service.generate(mockTitle, mockContent, { maxRetries: 1 })
      ).rejects.toThrow('Failed to generate summary after 1 attempts');
    });

    it('should handle validation failure', async () => {
      mockValidateResult.mockReturnValue(false);
      
      await expect(
        service.generate(mockTitle, mockContent, { maxRetries: 1 })
      ).rejects.toThrow('Failed to generate summary after 1 attempts');
    });

    it('should truncate content when too long', async () => {
      const longContent = 'a'.repeat(200000);
      
      await service.generate(mockTitle, longContent, { 
        contentMaxLength: 100000 
      });
      
      const promptCall = mockGeneratePrompt.mock.calls[0];
      expect(promptCall[1].length).toBeLessThanOrEqual(100000);
    });

    it('should handle API response without candidates', async () => {
      // Clear the previous mock setup
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] })
      } as Response);
      
      await expect(
        service.generate(mockTitle, mockContent, { maxRetries: 1 })
      ).rejects.toThrow('Failed to generate summary after 1 attempts');
    });
  });

  describe('preprocessContent', () => {
    it('should handle content with metadata properly', async () => {
      const contentWithMetadata = `
        Title: Test Article
        Author: Test Author
        Date: 2024-01-01
        
        ${'Main content here. This is a longer test content to ensure it uses the mocked function. '.repeat(10)}
      `;
      
      await service.generate('Title', contentWithMetadata);
      
      // The preprocessed content includes the metadata
      expect(mockGeneratePrompt).toHaveBeenCalledWith(
        'Title',
        expect.stringContaining('Main content')
      );
    });
  });
});