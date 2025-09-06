/**
 * Performance Optimization API Tests
 * Phase 1実装の動作確認テスト
 */

const BASE_URL = 'http://localhost:3001';

// ANSI Color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

async function runTest(name, fn) {
  process.stdout.write(`${BLUE}Testing: ${name}...${RESET} `);
  try {
    const startTime = Date.now();
    await fn();
    const duration = Date.now() - startTime;
    console.log(`${GREEN}✓${RESET} (${duration}ms)`);
    testResults.passed++;
    testResults.tests.push({ name, status: 'passed', duration });
  } catch (error) {
    console.log(`${RED}✗ ${error.message}${RESET}`);
    testResults.failed++;
    testResults.tests.push({ name, status: 'failed', error: error.message });
  }
}

async function testAPIEndpoint() {
  console.log(`\n${YELLOW}=== API Endpoint Tests ===${RESET}\n`);

  // Test 1: Basic API response
  await runTest('/api/articles - Basic Response', async () => {
    const response = await fetch(`${BASE_URL}/api/articles?limit=10`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (!data.success) throw new Error('Response not successful');
    if (!data.data) throw new Error('No data in response');
    if (!Array.isArray(data.data.items)) throw new Error('Items not an array');
  });

  // Test 2: Server-Timing header presence
  await runTest('/api/articles - Server-Timing Header', async () => {
    const response = await fetch(`${BASE_URL}/api/articles?limit=5`);
    const serverTiming = response.headers.get('Server-Timing');
    
    if (!serverTiming) throw new Error('Server-Timing header missing');
    
    // Parse Server-Timing header
    const timings = serverTiming.split(',').map(t => {
      const match = t.trim().match(/^([^;]+);dur=([0-9.]+)/);
      return match ? { name: match[1], duration: parseFloat(match[2]) } : null;
    }).filter(Boolean);
    
    // Check for expected metrics
    const hasDbCount = timings.some(t => t.name === 'db_count');
    const hasDbQuery = timings.some(t => t.name === 'db_query');
    const hasCache = timings.some(t => t.name === 'cache');
    const hasTotal = timings.some(t => t.name === 'total');
    
    if (!hasTotal) throw new Error('Missing total metric in Server-Timing');
    
    console.log(`    ${GREEN}Metrics found: ${timings.map(t => `${t.name}=${t.duration}ms`).join(', ')}${RESET}`);
  });

  // Test 3: Cache Header
  await runTest('/api/articles - Cache Status Header', async () => {
    const response = await fetch(`${BASE_URL}/api/articles?limit=5`);
    const cacheStatus = response.headers.get('X-Cache-Status');
    
    if (!cacheStatus) throw new Error('X-Cache-Status header missing');
    if (!['HIT', 'MISS', 'STALE'].includes(cacheStatus)) {
      throw new Error(`Invalid cache status: ${cacheStatus}`);
    }
    
    console.log(`    ${GREEN}Cache status: ${cacheStatus}${RESET}`);
  });

  // Test 4: Response time comparison (with and without cache)
  await runTest('/api/articles - Performance Metrics', async () => {
    // First request (likely cache miss)
    const start1 = Date.now();
    const response1 = await fetch(`${BASE_URL}/api/articles?limit=20&_t=${Date.now()}`);
    const time1 = Date.now() - start1;
    
    // Second request (likely cache hit)
    const start2 = Date.now();
    const response2 = await fetch(`${BASE_URL}/api/articles?limit=20`);
    const time2 = Date.now() - start2;
    
    const cacheStatus1 = response1.headers.get('X-Cache-Status');
    const cacheStatus2 = response2.headers.get('X-Cache-Status');
    
    console.log(`    First request: ${time1}ms (${cacheStatus1}), Second request: ${time2}ms (${cacheStatus2})`);
    
    // Second request should typically be faster if cache is working
    if (cacheStatus2 === 'HIT' && time2 > time1 * 1.5) {
      console.log(`    ${YELLOW}Warning: Cache hit was slower than expected${RESET}`);
    }
  });

  // Test 5: Pagination parameters
  await runTest('/api/articles - Pagination', async () => {
    const response = await fetch(`${BASE_URL}/api/articles?page=2&limit=10`);
    const data = await response.json();
    
    if (data.data.page !== 2) throw new Error('Page parameter not working');
    if (data.data.limit !== 10) throw new Error('Limit parameter not working');
    if (!data.data.totalPages) throw new Error('Missing totalPages');
  });

  // Test 6: Error handling
  await runTest('/api/articles - Error Handling', async () => {
    const response = await fetch(`${BASE_URL}/api/articles?limit=1000`); // Max is 100
    const data = await response.json();
    
    // Should clamp to max 100
    if (data.data.limit > 100) throw new Error('Limit not clamped to max');
  });
}

async function testCacheEndpoints() {
  console.log(`\n${YELLOW}=== Cache Endpoint Tests ===${RESET}\n`);

  // Test cache stats endpoint
  await runTest('/api/cache/stats - Response', async () => {
    const response = await fetch(`${BASE_URL}/api/cache/stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (!data.caches) throw new Error('Missing caches data');
    if (!data.redis) throw new Error('Missing Redis status');
    if (!data.redis.connected) throw new Error('Redis not connected');
  });

  // Test cache health endpoint
  await runTest('/api/cache/health - Response', async () => {
    const response = await fetch(`${BASE_URL}/api/cache/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.status !== 'healthy') throw new Error('Cache not healthy');
    if (!data.redis) throw new Error('Missing Redis status');
    if (!data.redis.connected) throw new Error('Redis not connected');
  });
}

async function testPerformanceMetrics() {
  console.log(`\n${YELLOW}=== Performance Metrics Tests ===${RESET}\n`);

  // Test response time distribution
  await runTest('Response Time Distribution', async () => {
    const timings = [];
    
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const response = await fetch(`${BASE_URL}/api/articles?limit=10&page=${i+1}`);
      const duration = Date.now() - start;
      
      const serverTiming = response.headers.get('Server-Timing');
      const cacheStatus = response.headers.get('X-Cache-Status');
      
      timings.push({
        total: duration,
        serverTiming,
        cacheStatus
      });
    }
    
    const avgTime = timings.reduce((sum, t) => sum + t.total, 0) / timings.length;
    const maxTime = Math.max(...timings.map(t => t.total));
    const minTime = Math.min(...timings.map(t => t.total));
    
    console.log(`    Avg: ${avgTime.toFixed(0)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
    
    // Performance threshold check
    if (avgTime > 500) {
      throw new Error(`Average response time too high: ${avgTime}ms`);
    }
  });
}

async function runAllTests() {
  console.log(`${BLUE}Starting Performance API Tests...${RESET}`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  await testAPIEndpoint();
  await testCacheEndpoints();
  await testPerformanceMetrics();

  // Summary
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`);
  console.log(`${GREEN}Passed: ${testResults.passed}${RESET}`);
  console.log(`${RED}Failed: ${testResults.failed}${RESET}`);
  
  const successRate = (testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate}%`);

  if (testResults.failed > 0) {
    console.log(`\n${RED}Failed Tests:${RESET}`);
    testResults.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    process.exit(1);
  }
  
  process.exit(0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${RED}Test execution failed: ${error.message}${RESET}`);
  process.exit(1);
});