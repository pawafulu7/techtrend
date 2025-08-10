import { http, HttpResponse } from 'msw';

export const handlers = [
  // Articles API
  http.get('/api/articles', ({ request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const source = url.searchParams.get('source');
    const tag = url.searchParams.get('tag');
    
    // Mock response
    const mockArticles = [
      {
        id: '1',
        title: 'Test Article 1',
        url: 'https://example.com/1',
        summary: 'This is a test article summary that meets the minimum character requirement of 90 characters for validation.',
        publishedAt: new Date('2025-01-20').toISOString(),
        sourceId: 'qiita',
        qualityScore: 85,
        source: {
          id: 'qiita',
          name: 'Qiita',
          type: 'rss',
        },
        tags: [
          { id: '1', name: 'React' },
          { id: '2', name: 'TypeScript' }
        ]
      },
      {
        id: '2',
        title: 'Test Article 2',
        url: 'https://example.com/2',
        summary: 'Another test article with proper summary length to pass validation tests. This needs to be at least 90 characters.',
        publishedAt: new Date('2025-01-19').toISOString(),
        sourceId: 'zenn',
        qualityScore: 75,
        source: {
          id: 'zenn',
          name: 'Zenn',
          type: 'rss',
        },
        tags: [
          { id: '3', name: 'JavaScript' }
        ]
      }
    ];
    
    // Filter by source
    let filteredArticles = mockArticles;
    if (source) {
      filteredArticles = filteredArticles.filter(a => a.sourceId === source);
    }
    
    // Filter by tag
    if (tag) {
      filteredArticles = filteredArticles.filter(a => 
        a.tags.some(t => t.name.toLowerCase() === tag.toLowerCase())
      );
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        items: filteredArticles,
        total: filteredArticles.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(filteredArticles.length / parseInt(limit))
      }
    });
  }),
  
  // Sources API
  http.get('/api/sources', () => {
    const mockSources = [
      {
        id: 'qiita',
        name: 'Qiita',
        type: 'rss',
        url: 'https://qiita.com',
        enabled: true,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      },
      {
        id: 'zenn',
        name: 'Zenn',
        type: 'rss',
        url: 'https://zenn.dev',
        enabled: true,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      },
      {
        id: 'devto',
        name: 'Dev.to',
        type: 'api',
        url: 'https://dev.to',
        enabled: true,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      }
    ];
    
    return HttpResponse.json({
      success: true,
      sources: mockSources,
      total: mockSources.length
    });
  }),
  
  // Sources Stats API
  http.get('/api/sources/stats', () => {
    const mockStats = [
      {
        sourceId: 'qiita',
        sourceName: 'Qiita',
        totalArticles: 150,
        avgQualityScore: 82,
        popularTags: ['React', 'TypeScript', 'JavaScript'],
        publishFrequency: 0.5,
        lastPublished: new Date('2025-01-20').toISOString(),
        growthRate: 15,
        category: 'community'
      },
      {
        sourceId: 'zenn',
        sourceName: 'Zenn',
        totalArticles: 120,
        avgQualityScore: 78,
        popularTags: ['React', 'Vue', 'Next.js'],
        publishFrequency: 0.4,
        lastPublished: new Date('2025-01-19').toISOString(),
        growthRate: 10,
        category: 'community'
      },
      {
        sourceId: 'devto',
        sourceName: 'Dev.to',
        totalArticles: 200,
        avgQualityScore: 75,
        popularTags: ['JavaScript', 'Python', 'DevOps'],
        publishFrequency: 0.8,
        lastPublished: new Date('2025-01-20').toISOString(),
        growthRate: 20,
        category: 'community'
      }
    ];
    
    return HttpResponse.json({
      success: true,
      stats: mockStats,
      total: mockStats.length,
      averageQualityScore: 78,
      totalArticles: 470
    });
  }),
  
  // Tags API
  http.get('/api/tags', () => {
    const mockTags = [
      { id: '1', name: 'React', count: 50 },
      { id: '2', name: 'TypeScript', count: 45 },
      { id: '3', name: 'JavaScript', count: 60 },
      { id: '4', name: 'Vue', count: 30 },
      { id: '5', name: 'Next.js', count: 35 },
    ];
    
    return HttpResponse.json({
      success: true,
      tags: mockTags,
      total: mockTags.length
    });
  }),
  
  // Health check
  http.get('/api/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  }),
];