/**
 * withFeedCollectTokenAuth（feeds/collect の GET 専用ラッパー）のテスト。
 *
 * このラッパーは withCronOrAdminAuth に委譲せず独自に Bearer を抽出するため、
 * 共有パーサー化（issue #647 項目3）で実際に挙動が変わる経路の 1 つである。
 * GET は CSRF 保護の対象外（CSRF_PROTECTED_METHODS に含まれない）なので、
 * サーバ間の Bearer 呼び出しがエンドツーエンドで到達しうる数少ない経路でもある。
 *
 * 本ファイル追加前はこのラッパーのテストが 1 件も存在しなかった。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';

import {
  withFeedCollectTokenAuth,
  withFeedCollectAuth,
} from '@/app/api/feeds/collect/with-feed-collect-auth';
import { resetEnvCache } from '@/lib/config/env';

const SECRET = 'valid-feed-collect-secret';

describe('withFeedCollectTokenAuth (GET)', () => {
  const mockHandler = jest.fn(async () => NextResponse.json({ success: true }));

  const buildRequest = (init?: { authorization?: string; token?: string }) => {
    const url = init?.token
      ? `http://localhost:3000/api/feeds/collect?token=${encodeURIComponent(init.token)}`
      : 'http://localhost:3000/api/feeds/collect';

    return new NextRequest(url, {
      headers: init?.authorization
        ? { Authorization: init.authorization }
        : undefined,
    });
  };

  beforeEach(() => {
    mockHandler.mockClear();
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  describe('Bearer 認証', () => {
    it.each(['CRON_SECRET', 'CRON_TOKEN'] as const)(
      '正しい Bearer トークンで通す (%s)',
      async (envVar) => {
        process.env[envVar] = SECRET;
        resetEnvCache();

        const response = await withFeedCollectTokenAuth(mockHandler)(
          buildRequest({ authorization: `Bearer ${SECRET}` })
        );

        expect(response.status).toBe(200);
        expect(mockHandler).toHaveBeenCalled();
      }
    );

    // Basic 認証ゲート（lib/auth/basic-auth-gate.ts）と同一の受理判定になることを固定する。
    // ゲートは通るが API 側で 401 になる不整合が issue #647 項目3 の原因だった。
    it.each([
      ['小文字スキーム', `bearer ${SECRET}`],
      ['大文字スキーム', `BEARER ${SECRET}`],
      ['タブ区切り', `Bearer\t${SECRET}`],
      ['複数空白区切り', `Bearer   ${SECRET}`],
      ['末尾に空白', `Bearer ${SECRET}  `],
    ])('%s でも通す（ゲートと同一の受理判定）', async (_label, authorization) => {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();

      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest({ authorization })
      );

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it.each([
      ['トークンが違う', 'Bearer wrong-secret'],
      ['複数トークン', `Bearer ${SECRET} extra`],
      ['スキームが Basic', `Basic ${SECRET}`],
      ['トークンなし', 'Bearer'],
      ['制御文字を含む', `Bearer ${SECRET}\u0001`],
    ])('%s は 401 にする', async (_label, authorization) => {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();

      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest({ authorization })
      );

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('Authorization ヘッダがなければ 401 にする', async () => {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();

      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest()
      );

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('シークレット未設定なら正しい形式でも 401 にする（fail-closed）', async () => {
      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest({ authorization: `Bearer ${SECRET}` })
      );

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('?token= クエリパラメータ（後方互換）', () => {
    it('正しい token で通す', async () => {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();

      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest({ token: SECRET })
      );

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('不正な token は Bearer にフォールスルーせず即 401 にする', async () => {
      process.env.CRON_SECRET = SECRET;
      resetEnvCache();

      // 正しい Bearer を同時に付けても、?token= が不正なら 401 で終端する
      const response = await withFeedCollectTokenAuth(mockHandler)(
        buildRequest({ token: 'wrong-token', authorization: `Bearer ${SECRET}` })
      );

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});

describe('withFeedCollectAuth (POST) の Bearer 経路', () => {
  const mockHandler = jest.fn(async () => NextResponse.json({ success: true }));

  beforeEach(() => {
    mockHandler.mockClear();
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  // POST は withCronOrAdminAuth へ委譲する。ラッパー単体では小文字スキームも
  // 受理されることを確認する（proxy 経路では CSRF が先に効くため、
  // エンドツーエンドでの到達性とは別の話である点に注意）。
  it('小文字スキームでも委譲先が受理する', async () => {
    process.env.CRON_SECRET = SECRET;
    resetEnvCache();

    const request = new NextRequest('http://localhost:3000/api/feeds/collect', {
      method: 'POST',
      headers: { Authorization: `bearer ${SECRET}` },
    });

    const response = await withFeedCollectAuth(mockHandler)(request);

    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalled();
  });
});
