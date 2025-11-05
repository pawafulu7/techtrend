import {
  loadGoldenSet,
  loadGoldenExamples,
  loadGoldenMetadata,
  GoldenSetLoadError,
  GoldenSetParseError,
  GoldenSetValidationError,
} from '@/lib/ai/testing/golden-set-loader';
import { readFile } from 'fs/promises';

jest.mock('fs/promises');

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

const validGoldenSet = {
  metadata: {
    version: '1.0.0',
    createdAt: '2025-11-05T00:00:00.000Z',
    totalExamples: 1,
    categoryDistribution: {
      general: 1,
      technical: 0,
      thin_content: 0,
      multilingual: 0,
    },
    qualityScoreRange: {
      min: 90,
      max: 100,
      avg: 95,
    },
    thresholdCalibration: {
      percentile95: 0.95,
      byCategory: {},
    },
  },
  examples: [
    {
      id: 'test-001',
      article: {
        title: 'Test Article',
        content: 'Test content',
        url: 'https://example.com/test',
      },
      expectedOutput: {
        summary: 'Test summary',
        detailedSummary: 'Detailed summary',
        tags: ['Test'],
      },
      metadata: {
        category: 'general',
        difficulty: 'easy',
        categoryConfidence: 0.9,
        needsHumanReview: false,
        categoryReason: 'Test data',
        createdAt: '2025-11-05T00:00:00.000Z',
        updatedAt: '2025-11-05T00:00:00.000Z',
      },
      acceptanceThreshold: {
        semanticSimilarity: 0.95,
        minimumQuality: 0.9,
      },
      sourceArticleId: 'source-001',
    },
  ],
};

describe('loadGoldenSet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should load valid golden set', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validGoldenSet));

    const result = await loadGoldenSet();

    expect(result.metadata.version).toBe('1.0.0');
    expect(result.examples).toHaveLength(1);
    expect(result.examples[0].id).toBe('test-001');
  });

  it('should throw GoldenSetLoadError for file not found', async () => {
    const error: NodeJS.ErrnoException = new Error('ENOENT');
    error.code = 'ENOENT';
    mockReadFile.mockRejectedValue(error);

    await expect(loadGoldenSet()).rejects.toThrow(GoldenSetLoadError);
    await expect(loadGoldenSet()).rejects.toThrow('Failed to load Golden Set');
  });

  it('should throw GoldenSetParseError for invalid JSON', async () => {
    mockReadFile.mockResolvedValue('{ invalid json }');

    await expect(loadGoldenSet()).rejects.toThrow(GoldenSetParseError);
  });

  it('should throw GoldenSetValidationError for schema mismatch', async () => {
    const invalidData = {
      metadata: {
        version: '1.0.0',
      },
      examples: [],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(invalidData));

    await expect(loadGoldenSet()).rejects.toThrow(GoldenSetValidationError);
  });

  it('should throw GoldenSetValidationError for invalid category', async () => {
    const invalidCategory = {
      ...validGoldenSet,
      examples: [
        {
          ...validGoldenSet.examples[0],
          metadata: {
            ...validGoldenSet.examples[0].metadata,
            category: 'invalid_category',
          },
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(invalidCategory));

    await expect(loadGoldenSet()).rejects.toThrow(GoldenSetValidationError);
  });

  it('should throw GoldenSetValidationError for invalid URL', async () => {
    const invalidUrl = {
      ...validGoldenSet,
      examples: [
        {
          ...validGoldenSet.examples[0],
          article: {
            ...validGoldenSet.examples[0].article,
            url: 'not-a-url',
          },
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(invalidUrl));

    await expect(loadGoldenSet()).rejects.toThrow(GoldenSetValidationError);
  });

  it('should accept empty examples array', async () => {
    const emptyExamples = {
      ...validGoldenSet,
      examples: [],
      metadata: {
        ...validGoldenSet.metadata,
        totalExamples: 0,
      },
    };

    mockReadFile.mockResolvedValue(JSON.stringify(emptyExamples));

    const result = await loadGoldenSet();

    expect(result.examples).toHaveLength(0);
  });

  it('should accept custom file path', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validGoldenSet));

    await loadGoldenSet('/custom/path/golden-set.json');

    expect(mockReadFile).toHaveBeenCalledWith(
      '/custom/path/golden-set.json',
      'utf-8'
    );
  });
});

describe('loadGoldenExamples', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return only examples array', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validGoldenSet));

    const examples = await loadGoldenExamples();

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe('test-001');
  });
});

describe('loadGoldenMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return only metadata', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validGoldenSet));

    const metadata = await loadGoldenMetadata();

    expect(metadata.version).toBe('1.0.0');
    expect(metadata.totalExamples).toBe(1);
  });
});
