/**
 * /api/tech-map/companies endpoint tests
 * /api/tech-map/companies/[groupId] endpoint tests
 */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/cache/redis-cache', () => {
  const _get = jest.fn().mockResolvedValue(null);
  const _set = jest.fn().mockResolvedValue(undefined);
  const _genKey = jest.fn((base: string) => base);
  return {
    __esModule: true,
    RedisCache: jest.fn().mockImplementation(() => ({
      generateCacheKey: _genKey,
      get: _get,
      set: _set,
    })),
    _testMockGet: _get,
  };
});

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_configKey: string, handler: Function) => handler),
}));

jest.mock('@/lib/services/company-tech-analysis-service', () => {
  const _getMatrix = jest.fn();
  const _getTimeline = jest.fn();
  class _CompanyNotFoundError extends Error {
    name = 'CompanyNotFoundError';
    constructor(groupId: string) {
      super(`Company (SourceGroup) not found: ${groupId}`);
    }
  }
  return {
    __esModule: true,
    CompanyTechAnalysisService: jest.fn(() => ({
      getMatrix: _getMatrix,
      getCompanyTimeline: _getTimeline,
      getCompanyList: jest.fn(),
    })),
    CompanyNotFoundError: _CompanyNotFoundError,
    _testMockGetMatrix: _getMatrix,
    _testMockGetTimeline: _getTimeline,
  };
});

import { NextRequest } from 'next/server';
import { GET as getCompanies } from '@/app/api/tech-map/companies/route';
import { GET as getCompanyTimeline } from '@/app/api/tech-map/companies/[groupId]/route';

const { _testMockGetMatrix: mockGetMatrix, _testMockGetTimeline: mockGetTimeline, CompanyNotFoundError } =
  jest.requireMock('@/lib/services/company-tech-analysis-service');
const { _testMockGet: mockCacheGet } = jest.requireMock('@/lib/cache/redis-cache');

const mockMatrixResponse = {
  companies: [
    { groupId: 'group-1', name: 'Google', articleCount: 50 },
    { groupId: 'group-2', name: 'Meta', articleCount: 30 },
  ],
  technologies: [
    { entityId: 'e1', name: 'React', type: 'FRAMEWORK' },
    { entityId: 'e2', name: 'TypeScript', type: 'LANGUAGE' },
  ],
  matrix: [
    { companyGroupId: 'group-1', entityId: 'e1', mentionCount: 10 },
    { companyGroupId: 'group-2', entityId: 'e1', mentionCount: 5 },
  ],
};

const mockTimelineResponse = {
  company: { groupId: 'group-1', name: 'Google' },
  timeline: [
    { month: '2026-01', entities: [{ entityId: 'e1', name: 'React', count: 5 }] },
    { month: '2026-02', entities: [{ entityId: 'e2', name: 'TypeScript', count: 3 }] },
  ],
};

describe('GET /api/tech-map/companies', () => {
  beforeEach(() => {
    mockGetMatrix.mockReset();
    mockCacheGet.mockReset();
    mockCacheGet.mockResolvedValue(null);
  });

  it('returns matrix with default params', async () => {
    mockGetMatrix.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies'));
    const response = await getCompanies(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.companies).toHaveLength(2);
    expect(data.technologies).toHaveLength(2);
    expect(data.matrix).toHaveLength(2);
  });

  it('passes query parameters to service', async () => {
    mockGetMatrix.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies?minMentions=5&limit=10&techLimit=15')
    );
    await getCompanies(request);
    expect(mockGetMatrix).toHaveBeenCalledWith({
      minMentions: 5,
      companyLimit: 10,
      techLimit: 15,
      entityTypes: undefined,
    });
  });

  it('parses entityTypes parameter', async () => {
    mockGetMatrix.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies?entityTypes=FRAMEWORK,LANGUAGE')
    );
    await getCompanies(request);
    expect(mockGetMatrix).toHaveBeenCalledWith(
      expect.objectContaining({ entityTypes: ['FRAMEWORK', 'LANGUAGE'] })
    );
  });

  it('returns 400 for invalid entityTypes', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies?entityTypes=INVALID_TYPE')
    );
    const response = await getCompanies(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid entityTypes');
  });

  it('clamps limit to 1-50 range', async () => {
    mockGetMatrix.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies?limit=999'));
    await getCompanies(request);
    expect(mockGetMatrix).toHaveBeenCalledWith(expect.objectContaining({ companyLimit: 50 }));
  });

  it('clamps techLimit to 1-50 range', async () => {
    mockGetMatrix.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies?techLimit=0'));
    await getCompanies(request);
    expect(mockGetMatrix).toHaveBeenCalledWith(expect.objectContaining({ techLimit: 1 }));
  });

  it('returns cached response when available', async () => {
    mockCacheGet.mockResolvedValue(mockMatrixResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies'));
    const response = await getCompanies(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.companies).toHaveLength(2);
    expect(mockGetMatrix).not.toHaveBeenCalled();
  });
});

describe('GET /api/tech-map/companies/[groupId]', () => {
  beforeEach(() => {
    mockGetTimeline.mockReset();
    mockCacheGet.mockReset();
    mockCacheGet.mockResolvedValue(null);
  });

  it('returns timeline for valid groupId', async () => {
    mockGetTimeline.mockResolvedValue(mockTimelineResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies/group-1'));
    const response = await getCompanyTimeline(request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.company.groupId).toBe('group-1');
    expect(data.timeline).toHaveLength(2);
  });

  it('passes months parameter to service', async () => {
    mockGetTimeline.mockResolvedValue(mockTimelineResponse);
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies/group-1?months=6')
    );
    await getCompanyTimeline(request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });
    expect(mockGetTimeline).toHaveBeenCalledWith('group-1', 6);
  });

  it('clamps months to 1-24 range', async () => {
    mockGetTimeline.mockResolvedValue(mockTimelineResponse);
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies/group-1?months=100')
    );
    await getCompanyTimeline(request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });
    expect(mockGetTimeline).toHaveBeenCalledWith('group-1', 24);
  });

  it('returns 404 for non-existent groupId', async () => {
    mockGetTimeline.mockRejectedValue(new CompanyNotFoundError('nonexistent'));
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/companies/nonexistent')
    );
    const response = await getCompanyTimeline(request, {
      params: Promise.resolve({ groupId: 'nonexistent' }),
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('returns cached response when available', async () => {
    mockCacheGet.mockResolvedValue(mockTimelineResponse);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/companies/group-1'));
    const response = await getCompanyTimeline(request, {
      params: Promise.resolve({ groupId: 'group-1' }),
    });
    expect(response.status).toBe(200);
    expect(mockGetTimeline).not.toHaveBeenCalled();
  });
});
