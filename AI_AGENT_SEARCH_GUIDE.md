# AI Agent Search - User Guide

**Last Updated**: 2025-10-24
**Feature Status**: Beta (Feature Flag Required)

---

## Overview

AI Agent Search allows you to search for articles using natural language queries in Japanese or English. Powered by OpenAI's GPT-4o-mini and semantic search technology, it understands your intent and provides curated article recommendations with contextual summaries.

---

## Features

- **Natural Language Queries**: Ask questions in plain Japanese or English
- **AI-Powered Recommendations**: Semantic search with relevance scoring
- **Markdown Responses**: Formatted answers with article links
- **Search History**: Automatic history tracking with suggestions
- **Keyboard Shortcuts**: Quick access via Cmd/Ctrl+Shift+K
- **Error Handling**: Clear error messages with retry options
- **Caching**: Fast responses for repeated queries

---

## How to Access

### Option 1: SearchBar CTA (Recommended)
1. From any page, locate the search bar
2. Click **"AI検索を試す"** link above the search input
3. You'll be redirected to `/search/agent`

### Option 2: Direct URL
Navigate directly to: `https://your-domain.com/search/agent`

### Requirements
- **Authentication**: Must be logged in
- **Feature Flag**: `NEXT_PUBLIC_ENABLE_AI_SEARCH=true` must be enabled

---

## How to Use

### Basic Search
1. Navigate to `/search/agent` or click the CTA
2. Enter your query in natural language
   - Example: "terraformについての記事をおすすめ5件教えて"
   - Example: "Next.js 15の新機能を教えて"
3. Press **Enter** or click **"検索"** button
4. Wait 2-12 seconds for AI to generate a response
5. Review the answer and related articles

### Using Search History
- Previously searched queries appear in a dropdown when you focus the input
- Click any suggestion to reuse that query
- History is stored locally (max 10 items)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+K` (Mac) | Focus search input |
| `Ctrl+Shift+K` (Windows/Linux) | Focus search input |
| `Enter` | Submit search |
| `Escape` | Close suggestions dropdown & unfocus |

---

## Response Indicators

### Cached Response
- **Badge**: "キャッシュ" (green)
- **Meaning**: Response retrieved from cache (instant)
- **Benefit**: No API cost, faster results

### Fallback Response
- **Badge**: "フォールバック" (red)
- **Meaning**: AI search temporarily unavailable
- **Action**: Standard search results shown instead

### Token Usage
- Displayed at the bottom of each response
- Example: "トークン使用: 1,234"
- Helps track API costs

---

## Rate Limits

### Default Limits
- **5 searches per minute** per user
- Enforced to prevent API abuse and control costs

### When Rate Limited
- Error message: "レート制限に達しました"
- Countdown timer: "60秒後に再試行できます"
- **Action**: Wait for the countdown to complete

---

## Error Messages

### 401 Unauthorized
- **Message**: "認証が必要です"
- **Cause**: Not logged in
- **Action**: Click **"ログイン"** button

### 429 Rate Limit Exceeded
- **Message**: "レート制限に達しました"
- **Cause**: Exceeded 5 searches/minute
- **Action**: Wait for countdown timer

### 400 Bad Request
- **Message**: "不正なリクエスト"
- **Cause**: Invalid query format
- **Action**: Check your query and retry

### 500 Internal Server Error
- **Message**: "サーバーエラー"
- **Cause**: Server-side issue
- **Action**: Click **"再試行"** button

### 408 Request Timeout
- **Message**: "タイムアウト"
- **Cause**: Request took longer than 30 seconds
- **Action**: Check network connection, click **"再試行"**

### Network Error
- **Message**: "ネットワークエラー"
- **Cause**: Connection failed
- **Action**: Check internet connection, click **"再試行"**

---

## Tips for Better Results

### Be Specific
- ❌ Bad: "Next.js"
- ✅ Good: "Next.js 15の新機能について教えて"

### Use Japanese for Japanese Content
- Japanese queries work better for Japanese articles
- English queries work for English content

### Check Cached Responses
- If you see the "キャッシュ" badge, results are instant
- No API cost for cached queries

### Provide Context
- Include technology names, versions, or specific topics
- Example: "React 19のServer Componentsについて"

---

## Troubleshooting

### CTA Not Visible
**Problem**: "AI検索を試す" link not showing

**Solutions**:
1. Check if you're logged in
2. Verify feature flag is enabled: `NEXT_PUBLIC_ENABLE_AI_SEARCH=true`
3. Refresh the page

### Page Redirects to Home
**Problem**: `/search/agent` redirects to `/`

**Causes**:
1. Feature flag disabled
2. Not authenticated

**Solutions**:
1. Enable feature flag in environment variables
2. Log in to your account

### No Response After 30 Seconds
**Problem**: Request timeout

**Solutions**:
1. Check your network connection
2. Try a simpler query
3. Click **"再試行"** button

### Fallback Mode
**Problem**: Seeing "AI検索が一時的に利用できない" warning

**Cause**: AI search service temporarily unavailable

**Action**: System automatically shows standard search results instead

---

## Technical Details

### Backend API
- **Endpoint**: `POST /api/rag/agent-search`
- **Model**: OpenAI GPT-4o-mini
- **Semantic Search**: text-embedding-3-small (1536 dimensions)
- **Vector Database**: PostgreSQL with pgvector extension

### Performance
- **Average Latency**: 2-8 seconds (p50)
- **Cache Hit Rate**: ~50%
- **Bundle Size**: 51.9 kB (First Load: 162 kB)

### Security
- **Authentication**: Auth.js v5 session-based
- **Rate Limiting**: Redis-backed, 5 req/min per user
- **Input Validation**: Query length limits, XSS prevention
- **Output Sanitization**: Markdown rendering with safe protocols only

---

## Cost Information

### Estimated Costs
- **Per Query**: ~$0.001 (1,000-2,000 tokens)
- **Monthly** (1,000 queries): ~$1.00
- **Cached Queries**: $0 (no API call)

### Cost Optimization
- Use cached responses when available
- Be specific to reduce token usage
- Check the token counter at the bottom of responses

---

## Known Limitations

### Query Length
- **Maximum**: No strict limit, but shorter queries perform better
- **Recommended**: 50-200 characters for optimal results

### Language Support
- **Primary**: Japanese
- **Secondary**: English
- **Best Results**: Match query language with article language

### Response Time
- **Typical**: 2-8 seconds
- **Maximum**: 30 seconds (then timeout)
- **Cached**: < 1 second

---

## Support

### Feedback
- Use thumbs up/down buttons to rate responses
- Feedback helps improve AI recommendations

### Issues
For technical issues or feature requests, contact your system administrator or file an issue in the project repository.

---

## Version History

### v1.0.0 (2025-10-24)
- Initial release
- Basic AI agent search functionality
- 14 E2E test scenarios
- Feature flag gated

### Upcoming Features
- Conversation history
- Saved queries
- Source/date filter integration
- Multi-turn conversations

---

## Related Documentation

- [Architecture Overview](../architecture/rag-system.md)
- [API Documentation](../api/rag-endpoints.md)
- [Feature Flags](../configuration/feature-flags.md)
