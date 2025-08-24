// APIエラーデバッグ用スクリプト
const { NextRequest } = require('next/server');

async function testAPI() {
  try {
    // モジュールを動的にインポート
    const { GET } = await import('./app/api/trends/analysis/route.ts');
    
    const request = new NextRequest('http://localhost:3000/api/trends/analysis?days=invalid');
    const response = await GET(request);
    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

testAPI();