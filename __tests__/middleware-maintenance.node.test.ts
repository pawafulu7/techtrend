/**
 * Maintenance Mode (proxy.ts) Test
 *
 * MAINTENANCE_MODE=true 時に管理者以外を HTTP 503 のメンテナンス画面へ切り替え、
 * 管理者・除外パス・OFF 時は通常フローを維持することを検証する。
 *
 * proxy は auth / getUserAuthData を動的 import するため、モジュールレベルで
 * モックすることで動的 import 経路にも適用される。
 */

// Mock definitions first (hoisting)
const mockGetSession = jest.fn();

jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// getUserAuthData だけをモックし、純粋関数 isAdminAuthData は実物を使う
jest.mock('@/lib/auth/user-auth-cache', () => ({
  ...jest.requireActual('@/lib/auth/user-auth-cache'),
  getUserAuthData: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';
import { AUTH_COOKIES } from '@/lib/config/auth-cookies';

const mockGetUserAuthData = getUserAuthData as jest.MockedFunction<
  typeof getUserAuthData
>;

/** ログイン済みリクエスト（セッション Cookie 付き）を作る。
 *  proxy はメンテ判定で Cookie の有無を先にチェックするため、
 *  getSession 経路を通すケースでは Cookie が必須。 */
function loggedInRequest(url: string): NextRequest {
  const request = new NextRequest(new URL(url));
  request.cookies.set(AUTH_COOKIES.sessionToken, 'dummy-session-token');
  return request;
}

describe('proxy - maintenance mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAINTENANCE_MODE = 'true';
    // デフォルトは未ログイン
    mockGetSession.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.MAINTENANCE_MODE;
  });

  describe('OFF 時（既存挙動を変えない）', () => {
    it('MAINTENANCE_MODE 未設定なら通常応答し、getSession を呼ばない', async () => {
      delete process.env.MAINTENANCE_MODE;
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).not.toBe(503);
      expect(mockGetSession).not.toHaveBeenCalled();
      // 既存のセキュリティヘッダは維持される
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
    });

    it("MAINTENANCE_MODE='false' なら通常応答", async () => {
      process.env.MAINTENANCE_MODE = 'false';
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).not.toBe(503);
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('前後スペース付きの値（" true "）でも有効化される（trim）', async () => {
      process.env.MAINTENANCE_MODE = ' true ';
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      // 未ログイン扱いで 503 に倒れる
      expect(response.status).toBe(503);
    });
  });

  describe('非管理者（メンテ画面に切り替え）', () => {
    it('未ログイン（Cookie 無し）は getSession を呼ばず 503 + Retry-After', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('3600');
      expect(response.headers.get('Content-Type')).toContain('text/html');
      // 本文がメンテ画面であること
      const body = await response.text();
      expect(body).toContain('メンテナンス中');
      // Cookie 先行チェックで早期 return するため認証経路は走らない
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockGetUserAuthData).not.toHaveBeenCalled();
    });

    it('一般ユーザー（role=user）は 503', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
      mockGetUserAuthData.mockResolvedValue({ role: 'user', deletedAt: null });

      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).toBe(503);
      expect(mockGetUserAuthData).toHaveBeenCalledWith('u1');
    });

    it('削除済み管理者（deletedAt あり）は 503', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-deleted' } });
      mockGetUserAuthData.mockResolvedValue({
        role: 'admin',
        deletedAt: '2026-01-01T00:00:00.000Z',
      });

      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).toBe(503);
    });

    it('Cookie はあるが session が無効（null）なら 503', async () => {
      mockGetSession.mockResolvedValue(null);
      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).toBe(503);
      expect(mockGetSession).toHaveBeenCalled();
    });

    it('503 レスポンスにもセキュリティヘッダが適用される', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).toBe(503);
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('管理者（バイパス）', () => {
    it('管理者（role=admin）は 503 にならず通常フローを通る', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-1' } });
      mockGetUserAuthData.mockResolvedValue({ role: 'admin', deletedAt: null });

      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).not.toBe(503);
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
    });
  });

  describe('除外パス（メンテ中も通常応答）', () => {
    it('/api/* は除外（getSession を呼ばない）', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/articles/list')
      );
      const response = await proxy(request);

      expect(response.status).not.toBe(503);
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('/auth/login は除外（管理者ログイン用）', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/auth/login')
      );
      const response = await proxy(request);

      expect(response.status).not.toBe(503);
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('/auth/signup は除外されない（メンテ中は封鎖）', async () => {
      mockGetSession.mockResolvedValue(null);
      const request = new NextRequest(
        new URL('http://localhost:3000/auth/signup')
      );
      const response = await proxy(request);

      expect(response.status).toBe(503);
    });
  });

  describe('フェイルセーフ', () => {
    it('getSession が throw しても 503 に倒す（500 にしない）', async () => {
      mockGetSession.mockRejectedValue(new Error('DB connection failed'));
      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).toBe(503);
    });

    it('getUserAuthData が throw しても 503 に倒す', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
      mockGetUserAuthData.mockRejectedValue(new Error('prisma error'));

      const response = await proxy(loggedInRequest('http://localhost:3000/'));

      expect(response.status).toBe(503);
    });
  });
});
