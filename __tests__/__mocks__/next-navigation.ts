import { jest } from '@jest/globals';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
};

const mockSearchParams = new URLSearchParams();

const mockPathname = '/';

export const useRouter = () => mockRouter;
export const useSearchParams = () => mockSearchParams;
export const usePathname = () => mockPathname;
export const useParams = () => ({});

// テストヘルパー
export const mockNextNavigation = {
  mockRouter,
  mockSearchParams,
  mockPathname,
  reset: () => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.refresh.mockClear();
    mockRouter.back.mockClear();
    mockRouter.forward.mockClear();
    mockRouter.prefetch.mockClear();
  },
};