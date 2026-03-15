import { EmbeddingService } from '@/lib/rag/embedding-service';

// Mock OpenAI to avoid real API calls
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: jest.fn(),
      },
    })),
  };
});

// Mock logger to suppress output during tests
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeError: jest.fn((err) => err),
}));

// Helper to create a mock embedding API response
function mockEmbeddingResponse(vectors: number[][]): object {
  return {
    data: vectors.map((embedding, index) => ({ embedding, index })),
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: 10, total_tokens: 10 },
  };
}

describe('EmbeddingService.embedBatch', () => {
  let service: EmbeddingService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // EmbeddingService uses 1536-dim validation by default; override to small dim for tests
    // We need to mock the schema validation as well, so use real 1536-dim vectors
    service = new EmbeddingService({ batchSize: 10 });

    // Access the OpenAI client's embeddings.create mock
    const OpenAI = require('openai').default;
    const openaiInstance =
      OpenAI.mock.results[OpenAI.mock.results.length - 1].value;
    mockCreate = openaiInstance.embeddings.create;
  });

  it('should return empty array for empty input', async () => {
    const result = await service.embedBatch([]);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should throw error when any text is empty string', async () => {
    await expect(
      service.embedBatch(['valid text', '', 'another text'])
    ).rejects.toThrow('Cannot embed empty text');

    // API should not be called when validation fails upfront
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should throw error when any text is whitespace-only', async () => {
    await expect(service.embedBatch(['valid text', '   '])).rejects.toThrow(
      'Cannot embed empty text'
    );

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should process a single text with one API call', async () => {
    const singleVector = new Array(1536).fill(0.1);
    mockCreate.mockResolvedValueOnce(mockEmbeddingResponse([singleVector]));

    const result = await service.embedBatch(['hello world']);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1536);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: ['hello world'],
      })
    );
  });

  it('should process multiple texts in a single API call', async () => {
    const texts = ['first text', 'second text', 'third text'];
    const vectors = texts.map((_, i) => {
      const vec = new Array(1536).fill(0);
      // Normalize so values are within [-1, 1] and not all zero
      vec[i] = 1;
      // Fill remaining with small values to pass validation
      for (let j = 0; j < 1536; j++) {
        if (vec[j] === 0) vec[j] = 0.001;
      }
      // Normalize to unit vector
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      return vec.map((v) => v / norm);
    });

    mockCreate.mockResolvedValueOnce(mockEmbeddingResponse(vectors));

    const result = await service.embedBatch(texts);

    expect(result).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: texts,
      })
    );
  });

  it('should preserve input order when API returns out-of-order results', async () => {
    const texts = ['text-a', 'text-b', 'text-c'];
    const vectorA = new Array(1536).fill(0.1);
    const vectorB = new Array(1536).fill(0.2);
    const vectorC = new Array(1536).fill(0.3);

    // Simulate API returning results out of order
    mockCreate.mockResolvedValueOnce({
      data: [
        { embedding: vectorC, index: 2 },
        { embedding: vectorA, index: 0 },
        { embedding: vectorB, index: 1 },
      ],
    });

    const result = await service.embedBatch(texts);

    expect(result).toHaveLength(3);
    // Result order should match input order, not API response order
    expect(result[0]).toEqual(vectorA);
    expect(result[1]).toEqual(vectorB);
    expect(result[2]).toEqual(vectorC);
  });

  it('should split large inputs into multiple API calls based on batchSize', async () => {
    // Create service with small batchSize to test chunking
    const smallBatchService = new EmbeddingService({ batchSize: 2 });
    const OpenAI = require('openai').default;
    const openaiInstance =
      OpenAI.mock.results[OpenAI.mock.results.length - 1].value;
    const smallBatchMockCreate = openaiInstance.embeddings.create;

    const texts = ['text-1', 'text-2', 'text-3'];
    const makeVector = (val: number) => new Array(1536).fill(val);

    // First batch: ['text-1', 'text-2']
    smallBatchMockCreate.mockResolvedValueOnce(
      mockEmbeddingResponse([makeVector(0.1), makeVector(0.2)])
    );
    // Second batch: ['text-3']
    smallBatchMockCreate.mockResolvedValueOnce(
      mockEmbeddingResponse([makeVector(0.3)])
    );

    const result = await smallBatchService.embedBatch(texts);

    expect(result).toHaveLength(3);
    expect(smallBatchMockCreate).toHaveBeenCalledTimes(2);
    // First batch call
    expect(smallBatchMockCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ input: ['text-1', 'text-2'] })
    );
    // Second batch call
    expect(smallBatchMockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ input: ['text-3'] })
    );
  });
});
