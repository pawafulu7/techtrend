import { UnifiedSummaryServiceImpl } from '../unified-summary-service';
import { SummaryProvider } from '../../adapter/summary-provider.interface';
import { QualityChecker } from '../quality-checker.interface';
import { PostProcessor } from '../post-processor.interface';
import { TitleTranslator } from '../../translator/gemini-title-translator';
import { SummaryServiceParams } from '../unified-summary-service.interface';
import { SUMMARY_VERSION } from '@/types/article';

describe('UnifiedSummaryServiceImpl', () => {
  let service: UnifiedSummaryServiceImpl;
  let mockSummaryProvider: jest.Mocked<SummaryProvider>;
  let mockQualityChecker: jest.Mocked<QualityChecker>;
  let mockPostProcessor: jest.Mocked<PostProcessor>;
  let mockTitleTranslator: jest.Mocked<TitleTranslator>;

  beforeEach(() => {
    mockSummaryProvider = {
      summarize: jest.fn(),
    };

    mockQualityChecker = {
      checkQuality: jest.fn(),
      calculateScore: jest.fn(),
    };

    mockPostProcessor = {
      cleanupSummary: jest.fn(),
      cleanupDetailedSummary: jest.fn(),
      formatTags: jest.fn(),
    };

    mockTitleTranslator = {
      translateTitle: jest.fn().mockResolvedValue(null),
    };

    service = new UnifiedSummaryServiceImpl(
      mockSummaryProvider,
      mockQualityChecker,
      mockPostProcessor,
      mockTitleTranslator,
      {
        qualityThreshold: 70,
        maxRetries: 3,
        translationEnabled: false,
      }
    );
  });

  describe('generateSummary', () => {
    it('should generate summary with quality check passing on first attempt', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
        articleType: 'technical',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary\n\n',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test', 'article'],
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test', 'article']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 85,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result).toEqual({
        summary: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test', 'article'],
        qualityScore: 85,
        processingTimeMs: expect.any(Number),
        summaryVersion: SUMMARY_VERSION.UNIFIED,
      });

      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(1);
      expect(mockPostProcessor.cleanupSummary).toHaveBeenCalledWith('Test Summary\n\n');
      expect(mockPostProcessor.cleanupDetailedSummary).toHaveBeenCalledWith(
        '・Item 1\n・Item 2\n・Item 3'
      );
      expect(mockPostProcessor.formatTags).toHaveBeenCalledWith(['test', 'article']);
      expect(mockQualityChecker.checkQuality).toHaveBeenCalledWith(
        'Test Summary',
        '・Item 1\n・Item 2\n・Item 3'
      );
    });

    it('should retry when quality is too low and succeed on second attempt', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize
        .mockResolvedValueOnce({
          headline: 'Short',
          detailedSummary: '・Item',
          category: 'Technology',
          tags: ['test'],
        })
        .mockResolvedValueOnce({
          headline: 'Good Quality Summary',
          detailedSummary: '・Item 1\n・Item 2\n・Item 3',
          category: 'Technology',
          tags: ['test', 'quality'],
        });

      mockPostProcessor.cleanupSummary
        .mockReturnValueOnce('Short')
        .mockReturnValueOnce('Good Quality Summary');
      mockPostProcessor.cleanupDetailedSummary
        .mockReturnValueOnce('・Item')
        .mockReturnValueOnce('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags
        .mockReturnValueOnce(['test'])
        .mockReturnValueOnce(['test', 'quality']);

      mockQualityChecker.checkQuality
        .mockReturnValueOnce({
          isValid: false,
          issues: [{ type: 'length', severity: 'major', message: 'Too short' }],
          requiresRegeneration: true,
          score: 45,
          itemCount: 1,
          itemCountValid: false,
        })
        .mockReturnValueOnce({
          isValid: true,
          issues: [],
          requiresRegeneration: false,
          score: 80,
          itemCount: 3,
          itemCountValid: true,
        });

      const result = await service.generateSummary(params);

      expect(result.qualityScore).toBe(80);
      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(2);
      expect(mockQualityChecker.checkQuality).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries when quality remains low', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Low Quality',
        detailedSummary: '・Bad',
        category: 'Technology',
        tags: [],
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Low Quality');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Bad');
      mockPostProcessor.formatTags.mockReturnValue([]);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: false,
        issues: [
          { type: 'length', severity: 'critical', message: 'Too short' },
          { type: 'itemCount', severity: 'critical', message: 'Insufficient items' },
        ],
        requiresRegeneration: true,
        score: 30,
        itemCount: 1,
        itemCountValid: false,
      });

      await expect(service.generateSummary(params)).rejects.toThrow(
        'Failed to generate quality summary after 3 attempts'
      );

      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(3);
      expect(mockQualityChecker.checkQuality).toHaveBeenCalledTimes(3);
    });

    it('should use custom quality threshold from params', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
        qualityThreshold: 90,
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Good Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Good Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 85,
        itemCount: 3,
        itemCountValid: true,
      });

      await expect(service.generateSummary(params)).rejects.toThrow('Quality too low: 85 < 90');

      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(3);
    });

    it('should handle provider errors and retry', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({
          headline: 'Recovered Summary',
          detailedSummary: '・Item 1\n・Item 2\n・Item 3',
          category: 'Technology',
          tags: ['test'],
        });

      mockPostProcessor.cleanupSummary.mockReturnValue('Recovered Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result.qualityScore).toBe(80);
      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries on provider errors', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockRejectedValue(new Error('Persistent API Error'));

      await expect(service.generateSummary(params)).rejects.toThrow(
        'Failed to generate quality summary after 3 attempts: Persistent API Error'
      );

      expect(mockSummaryProvider.summarize).toHaveBeenCalledTimes(3);
    });

    it('should pass correct parameters to summary provider', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
        articleType: 'tutorial',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Tutorial',
        tags: ['test'],
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      await service.generateSummary(params);

      expect(mockSummaryProvider.summarize).toHaveBeenCalledWith({
        title: 'Test Article',
        content: 'This is a test article content.',
        articleType: 'tutorial',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: expect.stringMatching(/^\d+-0$/),
      });
    });

    it('should handle empty tags array', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: [],
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue([]);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result.tags).toEqual([]);
      expect(mockPostProcessor.formatTags).toHaveBeenCalledWith([]);
    });

    it('should handle undefined tags', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue([]);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result.tags).toEqual([]);
      expect(mockPostProcessor.formatTags).toHaveBeenCalledWith([]);
    });

    // TODO: Fix timing precision issue (99ms vs 100ms) - see GitHub issue #141
    it.skip('should include processing time in result', async () => {
      const params: SummaryServiceParams = {
        title: 'Test Article',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                headline: 'Test Summary',
                detailedSummary: '・Item 1\n・Item 2\n・Item 3',
                category: 'Technology',
                tags: ['test'],
              });
            }, 100);
          })
      );

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('title translation', () => {
    it('should include translatedTitle when translation is enabled and succeeds', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle.mockResolvedValue('翻訳されたタイトル');

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBe('翻訳されたタイトル');
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalledWith({
        title: 'English Title',
        summary: 'Test Summary',
        requestId: expect.stringMatching(/^\d+-0$/),
      });
    });

    it('should continue processing when translation fails', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle.mockRejectedValue(new Error('Translation API Error'));

      const result = await service.generateSummary(params);

      expect(result.summary).toBe('Test Summary');
      expect(result.translatedTitle).toBeUndefined();
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalled();
    });

    it('should not call translator when translation is disabled', async () => {
      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBeUndefined();
      expect(mockTitleTranslator.translateTitle).not.toHaveBeenCalled();
    });

    it('should retry translation on first failure and succeed on second attempt', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('翻訳成功');

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBe('翻訳成功');
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalledTimes(2);

      expect(mockTitleTranslator.translateTitle).toHaveBeenNthCalledWith(1, {
        title: 'English Title',
        summary: 'Test Summary',
        requestId: expect.stringMatching(/^\d+-0$/),
      });

      expect(mockTitleTranslator.translateTitle).toHaveBeenNthCalledWith(2, {
        title: 'English Title',
        summary: undefined,
        requestId: expect.stringMatching(/^\d+-0-retry1$/),
      });
    });

    it('should succeed on third attempt after two failures', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle
        .mockRejectedValueOnce(new Error('API error 1'))
        .mockRejectedValueOnce(new Error('API error 2'))
        .mockResolvedValueOnce('3回目で成功');

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBe('3回目で成功');
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalledTimes(3);
    });

    it('should return undefined after 3 failed attempts', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle
        .mockRejectedValueOnce(new Error('API error 1'))
        .mockRejectedValueOnce(new Error('API error 2'))
        .mockRejectedValueOnce(new Error('API error 3'));

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBeUndefined();
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalledTimes(3);
    });

    it('should append retry suffix to requestId on subsequent attempts', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('翻訳成功');

      await service.generateSummary(params);

      expect(mockTitleTranslator.translateTitle).toHaveBeenNthCalledWith(1, {
        title: 'English Title',
        summary: 'Test Summary',
        requestId: expect.stringMatching(/^\d+-0$/),
      });

      expect(mockTitleTranslator.translateTitle).toHaveBeenNthCalledWith(2, {
        title: 'English Title',
        summary: undefined,
        requestId: expect.stringMatching(/^\d+-0-retry1$/),
      });
    });

    it('should handle empty translation results and retry', async () => {
      service = new UnifiedSummaryServiceImpl(
        mockSummaryProvider,
        mockQualityChecker,
        mockPostProcessor,
        mockTitleTranslator,
        {
          qualityThreshold: 70,
          maxRetries: 3,
          translationEnabled: true,
        }
      );

      const params: SummaryServiceParams = {
        title: 'English Title',
        content: 'This is a test article content.',
      };

      mockSummaryProvider.summarize.mockResolvedValue({
        headline: 'Test Summary',
        detailedSummary: '・Item 1\n・Item 2\n・Item 3',
        category: 'Technology',
        tags: ['test'],
        confidence: 0.9,
      });

      mockPostProcessor.cleanupSummary.mockReturnValue('Test Summary');
      mockPostProcessor.cleanupDetailedSummary.mockReturnValue('・Item 1\n・Item 2\n・Item 3');
      mockPostProcessor.formatTags.mockReturnValue(['test']);

      mockQualityChecker.checkQuality.mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
        itemCount: 3,
        itemCountValid: true,
      });

      mockTitleTranslator.translateTitle
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('翻訳成功');

      const result = await service.generateSummary(params);

      expect(result.translatedTitle).toBe('翻訳成功');
      expect(mockTitleTranslator.translateTitle).toHaveBeenCalledTimes(2);
    });
  });
});