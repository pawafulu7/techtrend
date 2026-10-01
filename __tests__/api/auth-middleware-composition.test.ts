/**
 * Auth middleware composition test (issue #659)
 *
 * Verifies the exact wrapper tree of every HTTP method exported by the routes
 * that moved from in-handler getSession() to withAdminAuth / withUserValidation.
 *
 * Each middleware mock returns a marker node instead of a function, so the
 * export of a route module is the whole composition tree. Asserting the tree
 * catches wrong nesting order (e.g. CSRF inside auth), a single method that
 * lost a wrapper, and wrong rate limit keys.
 */

type MarkerNode = {
  kind: 'csrf' | 'rateLimit' | 'adminAuth' | 'userValidation';
  key?: string;
  inner: unknown;
};

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (inner: unknown) => ({ kind: 'csrf', inner }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (key: string, inner: unknown) => ({
    kind: 'rateLimit',
    key,
    inner,
  }),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: (inner: unknown) => ({ kind: 'adminAuth', inner }),
}));

jest.mock('@/lib/middleware/with-user-validation', () => ({
  withUserValidation: (inner: unknown) => ({ kind: 'userValidation', inner }),
  createUserDeletedResponse: jest.fn(),
}));

const HANDLER = expect.any(Function);

const csrf = (inner: unknown) => ({ kind: 'csrf', inner });
const rateLimit = (key: string, inner: unknown) => ({
  kind: 'rateLimit',
  key,
  inner,
});
const adminAuth = (inner: unknown) => ({ kind: 'adminAuth', inner });
const userValidation = (inner: unknown) => ({ kind: 'userValidation', inner });

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const ROUTES: Array<{
  modulePath: string;
  methods: Record<string, unknown>;
}> = [
  // Admin API -> withAdminAuth
  {
    modulePath: '@/app/api/admin/social-posts/route',
    methods: {
      GET: adminAuth(HANDLER),
      POST: csrf(rateLimit('admin:social-post-write', adminAuth(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/[id]/route',
    methods: {
      GET: adminAuth(HANDLER),
      PATCH: csrf(rateLimit('admin:social-post-write', adminAuth(HANDLER))),
      DELETE: csrf(rateLimit('admin:social-post-write', adminAuth(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/bulk/route',
    methods: {
      POST: csrf(rateLimit('admin:social-post-bulk', adminAuth(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/generate/route',
    methods: {
      POST: csrf(rateLimit('admin:social-post-generate', adminAuth(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/generate-opinion/route',
    methods: {
      POST: csrf(rateLimit('admin:social-post-generate', adminAuth(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/generate-from-article/route',
    methods: {
      POST: csrf(
        rateLimit('admin:social-post-generate-article', adminAuth(HANDLER))
      ),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/articles/candidates/route',
    methods: {
      GET: adminAuth(rateLimit('admin:social-post-candidates', HANDLER)),
    },
  },
  {
    modulePath: '@/app/api/admin/social-posts/stats/route',
    methods: { GET: adminAuth(HANDLER) },
  },
  {
    modulePath: '@/app/api/cache/stats/route',
    methods: { GET: adminAuth(HANDLER) },
  },
  {
    modulePath: '@/app/api/metrics/batch-optimizer/route',
    methods: { GET: adminAuth(HANDLER) },
  },
  // User API -> withUserValidation
  {
    modulePath: '@/app/api/rag/search/route',
    methods: { POST: csrf(userValidation(HANDLER)) },
  },
  {
    modulePath: '@/app/api/favorites/batch/route',
    methods: {
      POST: csrf(rateLimit('read:favorite:batch', userValidation(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/user/preferences/categories/route',
    methods: {
      GET: userValidation(HANDLER),
      POST: csrf(rateLimit('write:preferences', userValidation(HANDLER))),
    },
  },
  {
    modulePath: '@/app/api/user/profile/route',
    methods: { GET: userValidation(HANDLER) },
  },
];

const ROWS = ROUTES.flatMap((route) =>
  Object.entries(route.methods).map(
    ([method, expected]) =>
      [`${method} ${route.modulePath}`, route.modulePath, method, expected] as const
  )
);

describe('Auth middleware composition (issue #659)', () => {
  it('covers all 18 HTTP methods of the 14 routes', () => {
    expect(ROUTES).toHaveLength(14);
    expect(ROWS).toHaveLength(18);
  });

  it.each(ROUTES.map((route) => [route.modulePath, route] as const))(
    '%s exports exactly the expected HTTP methods',
    (_label, route) => {
      const mod = require(route.modulePath);
      const exported = HTTP_METHODS.filter((m) => m in mod);
      expect(exported.sort()).toEqual(Object.keys(route.methods).sort());
    }
  );

  it.each(ROWS)('%s has the expected wrapper tree', (_label, modulePath, method, expected) => {
    const mod = require(modulePath);
    const tree = mod[method] as MarkerNode;
    expect(tree).toEqual(expected);
  });
});
