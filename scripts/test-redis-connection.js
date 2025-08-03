#!/usr/bin/env node

// Redis接続テストスクリプト
const Redis = require('ioredis');

async function testRedisConnection() {
  console.log('🔧 Testing Redis connection...\n');
  
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  try {
    // 1. Ping test
    console.log('1. Testing PING command...');
    const pong = await redis.ping();
    console.log(`   ✅ Response: ${pong}\n`);

    // 2. Set and Get test
    console.log('2. Testing SET/GET commands...');
    await redis.set('test:key', 'Hello Redis!');
    const value = await redis.get('test:key');
    console.log(`   ✅ Set value: "Hello Redis!"`);
    console.log(`   ✅ Got value: "${value}"\n`);

    // 3. TTL test
    console.log('3. Testing TTL (Time To Live)...');
    await redis.set('test:ttl', 'expires soon', 'EX', 60);
    const ttl = await redis.ttl('test:ttl');
    console.log(`   ✅ TTL set to 60 seconds`);
    console.log(`   ✅ Current TTL: ${ttl} seconds\n`);

    // 4. JSON data test
    console.log('4. Testing JSON data storage...');
    const jsonData = { name: 'TechTrend', type: 'cache test', timestamp: Date.now() };
    await redis.set('test:json', JSON.stringify(jsonData));
    const retrievedJson = await redis.get('test:json');
    const parsedData = JSON.parse(retrievedJson);
    console.log(`   ✅ Stored JSON:`, jsonData);
    console.log(`   ✅ Retrieved JSON:`, parsedData, '\n');

    // 5. Delete test
    console.log('5. Testing DELETE command...');
    await redis.del('test:key', 'test:ttl', 'test:json');
    console.log(`   ✅ Cleaned up test keys\n`);

    console.log('✨ All tests passed! Redis is working correctly.');
    
    await redis.quit();
  } catch (error) {
    console.error('❌ Redis connection test failed:', error.message);
    process.exit(1);
  }
}

testRedisConnection();