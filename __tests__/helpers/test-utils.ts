/**
 * シンプルなテストユーティリティ
 * MSW依存を排除し、純粋なJestモックを使用
 */

import { NextRequest, _NextResponse } from 'next/server';

/**
 * APIハンドラーをテストするためのヘルパー関数
 */
export async function testApiHandler(
  handler: any, // Type flexibility for various handler signatures
  options: {
    method?: string;
    url?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const {
    method = 'GET',
    url = 'http://localhost:3000/api/test',
    body,
    headers = {}
  } = options;

  // NextRequest オブジェクトを作成
  const request = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await handler(request);
  
  // レスポンスの処理
  let data;
  try {
    data = await response.json();
  } catch (error) {
    // JSONパースに失敗した場合はテキストとして取得
    data = await response.text();
  }

  return {
    data,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

/**
 * APIレスポンスの基本的な検証
 */
export function assertApiResponse(response: any) {
  expect(response).toBeDefined();
  expect(response.status).toBeDefined();
  expect(response.data).toBeDefined();
}

/**
 * 成功レスポンスの検証
 */
export function assertSuccessResponse(response: any) {
  assertApiResponse(response);
  expect(response.status).toBe(200);
  expect(response.data.success).toBe(true);
}

/**
 * エラーレスポンスの検証
 */
export function assertErrorResponse(response: any, expectedStatus: number) {
  assertApiResponse(response);
  expect(response.status).toBe(expectedStatus);
  expect(response.data.success).toBe(false);
  expect(response.data.error).toBeDefined();
}