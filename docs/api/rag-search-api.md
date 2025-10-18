# RAG Semantic Search API

Version: 1.0
Last Updated: 2025-10-18
Status: Draft (Phase 1 POC)

---

## Overview

The RAG Semantic Search API provides semantic similarity search capabilities for TechTrend articles using vector embeddings and pgvector. Unlike traditional keyword search, this API understands the meaning of queries and returns semantically similar articles.

**Use Cases**:
- "React performance optimization" matches articles about "useMemo" and "React.memo"
- "How to optimize images in Next.js?" finds relevant Next.js image optimization articles
- Fuzzy search with typos and variations

---

## Endpoint

```
POST /api/rag/search
```

## Authentication

**Required**: Auth.js v5 session cookie

The endpoint is protected and requires an authenticated session. Unauthenticated requests will receive a 401 Unauthorized response.

## Rate Limiting

**Limit**: 10 requests per minute per user

Exceeding this limit will result in a 429 Too Many Requests response with retry-after information.

---

## Request

### Request Body (JSON)

```json
{
  "query": string,
  "topK": number,
  "similarityThreshold": number,
  "embeddingKey": string,
  "filters": {
    "sources": string[],
    "tags": string[]
  }
}
```

### Parameters

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `query` | string | Yes | - | Min 1, max 500 chars | Search query text |
| `topK` | number | No | 10 | Min 1, max 100 | Number of results to return |
| `similarityThreshold` | number | No | 0.7 | Range 0-1 | Minimum cosine similarity score |
| `embeddingKey` | string | No | "summary" | "title" \| "summary" \| "both" | Which embedding field to search |
| `filters.sources` | string[] | No | - | Max 50 items, CUID format | Filter by source IDs |
| `filters.tags` | string[] | No | - | Max 20 items | Filter by tag names |

### Example Request

```bash
curl -X POST https://techtrend.example.com/api/rag/search \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "query": "React performance optimization techniques",
    "topK": 5,
    "similarityThreshold": 0.75,
    "embeddingKey": "summary",
    "filters": {
      "tags": ["React", "Performance"],
      "sources": ["clh1abc123def", "clh2xyz789ghi"]
    }
  }'
```

---

## Response

### Success Response (200 OK)

```json
{
  "query": "React performance optimization techniques",
  "results": [
    {
      "articleId": "clh3article123",
      "title": "Optimizing React Apps with useMemo and useCallback",
      "summary": "Learn how to use React hooks for performance optimization...",
      "translatedTitle": "useMemoとuseCallbackでReactアプリを最適化する",
      "similarity": 0.92,
      "publishedAt": "2025-10-15T10:30:00.000Z",
      "sourceId": "clh1abc123def",
      "embeddingKey": "summary"
    },
    {
      "articleId": "clh4article456",
      "title": "React.memo and React Performance Best Practices",
      "summary": "Comprehensive guide to React performance optimization strategies...",
      "translatedTitle": "React.memoとReactパフォーマンスのベストプラクティス",
      "similarity": 0.88,
      "publishedAt": "2025-10-14T14:20:00.000Z",
      "sourceId": "clh2xyz789ghi",
      "embeddingKey": "summary"
    }
  ],
  "count": 2,
  "model": "text-embedding-3-small",
  "version": 1
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Original query text (echoed back) |
| `results` | array | Array of matching articles |
| `results[].articleId` | string | Unique article identifier (CUID) |
| `results[].title` | string | Article title (original language) |
| `results[].summary` | string \| null | Article summary (one-line) |
| `results[].translatedTitle` | string \| null | Japanese translated title |
| `results[].similarity` | number | Cosine similarity score (0-1, higher is better) |
| `results[].publishedAt` | string | Publication date (ISO 8601 format) |
| `results[].sourceId` | string | Source identifier |
| `results[].embeddingKey` | string | Which field matched ("title" or "summary") |
| `count` | number | Number of results returned |
| `model` | string | Embedding model used |
| `version` | number | Embedding version |

---

## Error Responses

### 401 Unauthorized

**Cause**: Missing or invalid session

```json
{
  "error": "Unauthorized - Authentication required"
}
```

### 429 Rate Limit Exceeded

**Cause**: Too many requests (>10/minute)

```json
{
  "error": "Rate limit exceeded",
  "limit": 10,
  "remaining": 0,
  "reset": "2025-10-18T12:05:00.000Z"
}
```

**Headers**:
- `X-RateLimit-Limit`: 10
- `X-RateLimit-Remaining`: 0
- `X-RateLimit-Reset`: ISO 8601 timestamp

### 400 Bad Request

**Cause**: Invalid request parameters

```json
{
  "error": "Invalid request parameters",
  "details": [
    {
      "field": "topK",
      "message": "topK must be at least 1"
    },
    {
      "field": "query",
      "message": "Query too long (max 500 characters)"
    }
  ]
}
```

### 500 Internal Server Error

**Cause**: Server-side error (OpenAI API failure, database error, etc.)

```json
{
  "error": "Internal server error",
  "details": "OpenAI API unavailable"
}
```

**Note**: `details` field is only included in development environment

---

## Implementation Details

### Embedding Model

**Current**: OpenAI `text-embedding-3-small`
- Dimensions: 1536
- Cost: $0.020 per 1M tokens
- Supports multilingual (English + Japanese)

### Vector Search Algorithm

**Method**: Cosine similarity with pgvector
**Operator**: `<=>` (cosine distance)
**Index**: IVFFLAT (POC), HNSW (production)

### Search Flow

1. Generate query embedding (OpenAI API)
2. Vector similarity search on `ArticleEmbedding` table
3. Filter by similarity threshold (default 0.7)
4. JOIN with `Article` table for full data
5. Apply metadata filters (sources, tags)
6. Return top-k results ordered by similarity

---

## Performance Characteristics

### Latency

| Component | Typical | p95 | p99 |
|-----------|---------|-----|-----|
| Query embedding generation | 50-100ms | 150ms | 300ms |
| Vector similarity search | 20-50ms | 100ms | 200ms |
| JOIN with Article | 5-10ms | 20ms | 50ms |
| **Total** | **75-160ms** | **270ms** | **550ms** |

### Capacity

- **Concurrent users**: 100 (Vercel Hobby), 1,000 (Pro)
- **Queries per second**: ~10 (limited by OpenAI API)
- **Articles supported**: Up to 100,000 (with HNSW index)

---

## Security

### Authentication

- Required: Auth.js v5 session
- Session validated on every request
- No anonymous access

### Rate Limiting

- Per-user limit: 10 requests/minute
- Enforced via Upstash Redis
- Prevents cost abuse and DDoS

### Input Validation

- All parameters validated with Zod schemas
- Query length limited to 500 characters
- Array parameters have max length limits
- SQL injection prevented via Prisma.sql

---

## Cost Estimation

### Per Query

- Query embedding: ~100 tokens × $0.00002 = $0.000002
- Estimated: $0.000002 per search query

### Monthly Cost (1,000 queries/day)

- 1,000 queries/day × 30 days = 30,000 queries/month
- 30,000 × $0.000002 = $0.06/month

---

## Client Example (TypeScript)

```typescript
interface RAGSearchRequest {
  query: string;
  topK?: number;
  similarityThreshold?: number;
  embeddingKey?: 'title' | 'summary' | 'both';
  filters?: {
    sources?: string[];
    tags?: string[];
  };
}

interface RAGSearchResponse {
  query: string;
  results: Array<{
    articleId: string;
    title: string;
    summary: string | null;
    translatedTitle: string | null;
    similarity: number;
    publishedAt: string;
    sourceId: string;
    embeddingKey: string;
  }>;
  count: number;
  model: string;
  version: number;
}

async function semanticSearch(request: RAGSearchRequest): Promise<RAGSearchResponse> {
  const response = await fetch('/api/rag/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include session cookie
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const error = await response.json();
      throw new Error(`Rate limited. Retry after ${error.reset}`);
    }
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return response.json();
}

// Usage
const results = await semanticSearch({
  query: 'React performance optimization',
  topK: 10,
  embeddingKey: 'summary',
  filters: {
    tags: ['React', 'Performance']
  }
});

console.log(`Found ${results.count} similar articles`);
results.results.forEach(article => {
  console.log(`${article.title} (similarity: ${(article.similarity * 100).toFixed(1)}%)`);
});
```

---

## Changelog

### Version 1.0 (2025-10-18)
- Initial API specification
- POST /api/rag/search endpoint
- Authentication and rate limiting
- Support for title, summary, and both embedding searches
- Metadata filtering (sources, tags)

---

## Future Enhancements

### Version 1.1 (Planned)
- [ ] Query embedding caching (Redis)
- [ ] Hybrid search (vector + keyword)
- [ ] Re-ranking with cross-encoder
- [ ] Search history and personalization

### Version 2.0 (Planned)
- [ ] Multi-modal search (code snippets, images)
- [ ] Conversational search (RAG chat)
- [ ] Batch search endpoint
- [ ] Search analytics and insights

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/techtrend/issues
- Documentation: /docs/rag/
- Operations Runbook: /docs/operations/rag-embedding-lifecycle.md
