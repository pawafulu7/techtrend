import {
  buildAppDependencies,
  getAppDependencies,
  resetAppDependencies,
  buildTestDependencies,
} from '../bootstrap';
import { GeminiTransportImpl } from '../../ai/transport/gemini-transport';
import { GeminiSummaryAdapter } from '../../ai/adapter/gemini-summary-adapter';
import { UnifiedSummaryServiceImpl } from '../../ai/service/unified-summary-service';

describe('bootstrap', () => {
  beforeEach(() => {
    resetAppDependencies();
  });

  describe('buildAppDependencies', () => {
    it('should create all dependencies with default config', () => {
      const deps = buildAppDependencies();

      expect(deps.transport).toBeInstanceOf(GeminiTransportImpl);
      expect(deps.adapter).toBeInstanceOf(GeminiSummaryAdapter);
      expect(deps.service).toBeInstanceOf(UnifiedSummaryServiceImpl);
      expect(deps.config).toBeDefined();
      expect(deps.config.gemini.model).toBe('gemini-2.0-flash-lite');
    });

    it('should create dependencies with config overrides', () => {
      const deps = buildAppDependencies({
        gemini: {
          model: 'gemini-2.5-pro',
        } as any,
        quality: {
          threshold: 85,
          maxRetries: 5,
        },
      });

      expect(deps.config.gemini.model).toBe('gemini-2.5-pro');
      expect(deps.config.quality.threshold).toBe(85);
      expect(deps.config.quality.maxRetries).toBe(5);
    });

    it('should wire dependencies correctly', () => {
      const deps = buildAppDependencies();

      expect(deps.transport).toBeInstanceOf(GeminiTransportImpl);
      expect(deps.adapter).toBeInstanceOf(GeminiSummaryAdapter);
      expect(deps.service).toBeInstanceOf(UnifiedSummaryServiceImpl);
    });
  });

  describe('getAppDependencies', () => {
    it('should return singleton instance', () => {
      const deps1 = getAppDependencies();
      const deps2 = getAppDependencies();

      expect(deps1).toBe(deps2);
      expect(deps1.transport).toBe(deps2.transport);
      expect(deps1.adapter).toBe(deps2.adapter);
      expect(deps1.service).toBe(deps2.service);
    });

    it('should create new instance after reset', () => {
      const deps1 = getAppDependencies();
      resetAppDependencies();
      const deps2 = getAppDependencies();

      expect(deps1).not.toBe(deps2);
      expect(deps1.transport).not.toBe(deps2.transport);
    });
  });

  describe('resetAppDependencies', () => {
    it('should reset singleton instance', () => {
      getAppDependencies();
      resetAppDependencies();

      const deps = getAppDependencies();
      expect(deps).toBeDefined();
    });

    it('should allow multiple resets', () => {
      getAppDependencies();
      resetAppDependencies();
      resetAppDependencies();
      resetAppDependencies();

      const deps = getAppDependencies();
      expect(deps).toBeDefined();
    });
  });

  describe('buildTestDependencies', () => {
    it('should create test dependencies with default config', () => {
      const deps = buildTestDependencies({});

      expect(deps.transport).toBeInstanceOf(GeminiTransportImpl);
      expect(deps.adapter).toBeInstanceOf(GeminiSummaryAdapter);
      expect(deps.service).toBeInstanceOf(UnifiedSummaryServiceImpl);
      expect(deps.config).toBeDefined();
    });

    it('should use provided transport mock', () => {
      const mockTransport = {
        sendRequest: jest.fn(),
      } as any;

      const deps = buildTestDependencies({
        transport: mockTransport,
      });

      expect(deps.transport).toBe(mockTransport);
    });

    it('should use provided adapter mock', () => {
      const mockAdapter = {
        summarize: jest.fn(),
      } as any;

      const deps = buildTestDependencies({
        adapter: mockAdapter,
      });

      expect(deps.adapter).toBe(mockAdapter);
    });

    it('should use provided service mock', () => {
      const mockService = {
        generateSummary: jest.fn(),
      } as any;

      const deps = buildTestDependencies({
        service: mockService,
      });

      expect(deps.service).toBe(mockService);
    });

    it('should use provided config overrides', () => {
      const deps = buildTestDependencies({
        config: {
          gemini: {
            model: 'test-model',
          } as any,
          quality: {
            threshold: 95,
            maxRetries: 1,
          },
        },
      });

      expect(deps.config.gemini.model).toBe('test-model');
      expect(deps.config.quality.threshold).toBe(95);
      expect(deps.config.quality.maxRetries).toBe(1);
    });

    it('should create test transport with test-key when no mock provided', () => {
      const deps = buildTestDependencies({});

      expect(deps.transport).toBeInstanceOf(GeminiTransportImpl);
    });

    it('should wire test dependencies correctly', () => {
      const deps = buildTestDependencies({});

      expect(deps.transport).toBeDefined();
      expect(deps.adapter).toBeDefined();
      expect(deps.service).toBeDefined();
      expect(deps.config).toBeDefined();
    });
  });
});