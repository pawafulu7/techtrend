/**
 * 問い合わせ API のミドルウェアの包み方
 *
 * auth-middleware-composition.test.ts と同じく、各ミドルウェアのモックが関数ではなく
 * 目印のオブジェクトを返すようにし、export された値そのものを木として比べる。
 * 包む順番の間違い・ミドルウェアの抜け・レート制限のキーの間違いを見つける。
 */

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (inner: unknown) => ({ kind: 'csrf', inner }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (key: string, inner: unknown) => ({
    kind: 'rateLimit',
    key,
    inner,
  }),
  createRateLimitedResponse: jest.fn(),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: (inner: unknown) => ({ kind: 'adminAuth', inner }),
}));

jest.mock('@/lib/middleware/with-user-validation', () => ({
  withUserValidation: (inner: unknown) => ({ kind: 'userValidation', inner }),
}));

const HANDLER = expect.any(Function);
const csrf = (inner: unknown) => ({ kind: 'csrf', inner });
const rateLimit = (key: string, inner: unknown) => ({
  kind: 'rateLimit',
  key,
  inner,
});
const adminAuth = (inner: unknown) => ({ kind: 'adminAuth', inner });

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const ROUTES: Array<{ modulePath: string; methods: Record<string, unknown> }> = [
  {
    // 未ログインでも送れるので withUserValidation は付けない
    modulePath: '@/app/api/inquiries/route',
    methods: { POST: csrf(rateLimit('write:inquiry', HANDLER)) },
  },
  {
    modulePath: '@/app/api/admin/inquiries/route',
    methods: { GET: adminAuth(rateLimit('admin:read', HANDLER)) },
  },
  {
    modulePath: '@/app/api/admin/inquiries/[id]/route',
    methods: {
      PATCH: csrf(rateLimit('admin:write', adminAuth(HANDLER))),
    },
  },
];

describe('問い合わせ API のミドルウェアの包み方', () => {
  it.each(ROUTES.map((route) => [route.modulePath, route] as const))(
    '%s は決めた HTTP メソッドだけを export する',
    (_label, route) => {
      const mod = require(route.modulePath);
      const exported = HTTP_METHODS.filter((m) => m in mod);
      expect(exported.sort()).toEqual(Object.keys(route.methods).sort());
    }
  );

  it.each(
    ROUTES.flatMap((route) =>
      Object.entries(route.methods).map(
        ([method, expected]) =>
          [`${method} ${route.modulePath}`, route.modulePath, method, expected] as const
      )
    )
  )('%s の包み方', (_label, modulePath, method, expected) => {
    const mod = require(modulePath);
    expect(mod[method]).toEqual(expected);
  });
});
