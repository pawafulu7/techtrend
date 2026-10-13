import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import type { Metric } from 'web-vitals';
import { WebVitalsReporter } from '@/app/components/analytics/web-vitals-reporter';

const mockHandlers: Array<(metric: Metric) => void> = [];

jest.mock('web-vitals', () => {
  const register = (handler: (metric: Metric) => void) => {
    mockHandlers.push(handler);
  };
  return {
    onLCP: register,
    onINP: register,
    onCLS: register,
    onFCP: register,
    onTTFB: register,
  };
});

function metric(overrides: Partial<Metric>): Metric {
  return {
    name: 'CLS',
    value: 0.05,
    delta: 0.05,
    id: 'v6-test',
    rating: 'good',
    entries: [],
    navigationType: 'navigate',
    navigationId: 1,
    navigationStartTime: 0,
    ...overrides,
  } as Metric;
}

/** 計測値を1件送らせて、送った本文の page を返す */
function sentPage(overrides: Partial<Metric>): string {
  mockHandlers[0](metric(overrides));
  const fetchMock = global.fetch as jest.Mock;
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(init.body).page;
}

describe('WebVitalsReporter', () => {
  beforeAll(() => {
    // 抽出（5%）に当たったセッションにする
    sessionStorage.setItem('webVitalsSampled', 'true');
    // 開発時と同じく StrictMode で effect を2回走らせる
    render(
      <StrictMode>
        <WebVitalsReporter />
      </StrictMode>
    );
  });

  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    // クライアント遷移で、送る時点のパスが計測を始めたページと変わっている状態
    window.history.pushState({}, '', '/trends');
  });

  it('registers each web-vitals handler once even when the effect runs twice', () => {
    expect(mockHandlers).toHaveLength(5);
  });

  it('sends the page the metric was measured on, not the current path', () => {
    expect(
      sentPage({ navigationURL: 'https://example.com/articles/abc?tab=qa' })
    ).toBe('/articles/abc');
  });

  it('sends the current path after a bfcache restore', () => {
    expect(
      sentPage({
        navigationType: 'back-forward-cache',
        navigationURL: 'https://example.com/',
      })
    ).toBe('/trends');
  });

  it('falls back to the current path when navigationURL is missing', () => {
    expect(sentPage({ navigationURL: undefined })).toBe('/trends');
  });

  it('falls back to the current path when navigationURL is not a URL', () => {
    expect(sentPage({ navigationURL: 'not a url' })).toBe('/trends');
  });
});
