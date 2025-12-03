import { Source } from '@prisma/client';
import { createFetcher } from '../../lib/fetchers/index';
import { DevelopersIOFetcher } from '../../lib/fetchers/developersio';

// Mock rss-parser to prevent actual network calls
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({ items: [] }),
  }));
});

describe('createFetcher - DevelopersIO sources', () => {
  const createMockSource = (name: string, id: string): Source => ({
    id,
    name,
    type: 'rss',
    url: `https://dev.classmethod.jp/tags/${id.replace('developersio_', '')}/feed/`,
    enabled: true,
    groupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it.each([
    ['DevelopersIO AWS', 'developersio_aws'],
    ['DevelopersIO AI', 'developersio_ai'],
    ['DevelopersIO Claude', 'developersio_claude'],
    ['DevelopersIO MCP', 'developersio_mcp'],
    ['DevelopersIO Security', 'developersio_security'],
  ])('should create DevelopersIOFetcher for source name "%s"', (name, id) => {
    const source = createMockSource(name, id);
    const fetcher = createFetcher(source);

    expect(fetcher).toBeInstanceOf(DevelopersIOFetcher);
  });

  it('should throw error for unsupported DevelopersIO source name', () => {
    // DevelopersIO Unknown doesn't match any case, so falls through to default
    const source = createMockSource('DevelopersIO Unknown', 'developersio_unknown');

    expect(() => createFetcher(source)).toThrow('Unsupported source: DevelopersIO Unknown');
  });

  it('should throw error for unsupported source', () => {
    const source = createMockSource('Unknown Source', 'unknown_source');

    expect(() => createFetcher(source)).toThrow('Unsupported source: Unknown Source');
  });
});
