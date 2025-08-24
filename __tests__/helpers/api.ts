/**
 * APIテスト用ヘルパー関数
 */

import { NextRequest } from 'next/server';

/**
 * NextRequestのモックを作成
 * テスト環境でnextUrlプロパティが正しく設定されるようにする
 */
export function createMockRequest(url: string): NextRequest {
  const request = new NextRequest(url);
  
  // テスト環境でnextUrlが未定義の場合は手動で設定
  if (!request.nextUrl) {
    Object.defineProperty(request, 'nextUrl', {
      value: new URL(url),
      writable: false,
      configurable: true
    });
  }
  
  return request;
}

/**
 * APIレスポンスのアサーションヘルパー
 */
export async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedErrorMessage?: string
) {
  expect(response.status).toBe(expectedStatus);
  
  if (expectedErrorMessage) {
    const data = await response.json();
    expect(data.error).toContain(expectedErrorMessage);
  }
}

/**
 * 成功レスポンスのアサーションヘルパー
 */
export async function assertSuccessResponse(
  response: Response,
  expectedStatus: number = 200
) {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data).toBeDefined();
  return data;
}