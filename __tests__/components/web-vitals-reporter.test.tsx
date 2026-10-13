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

  it('sends the path the page was restored on from bfcache, even after client navigation', () => {
    const bfcacheMetric = {
      navigationType: 'back-forward-cache' as const,
      // web-vitals は戻ったときも最初に開いた URL を引き継ぐ
      navigationURL: 'https://example.com/',
    };
    // 戻ったことをまだ受け取っていなければ、今のパス
    expect(sentPage(bfcacheMetric)).toBe('/trends');

    window.history.pushState({}, '', '/restored');
    const pageshow = new Event('pageshow');
    Object.defineProperty(pageshow, 'persisted', { value: true });
    window.dispatchEvent(pageshow);
    window.history.pushState({}, '', '/after-client-navigation');

    expect(sentPage(bfcacheMetric)).toBe('/restored');
  });

  it('falls back to the current path when navigationURL is missing', () => {
    expect(sentPage({ navigationURL: undefined })).toBe('/trends');
  });

  it('falls back to the current path when navigationURL is not a URL', () => {
    expect(sentPage({ navigationURL: 'not a url' })).toBe('/trends');
  });

  describe('when sendBeacon is available', () => {
    const sendBeacon = jest.fn();

    beforeEach(() => {
      sendBeacon.mockReset();
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeacon,
        configurable: true,
      });
    });

    afterEach(() => {
      // jsdom には無いので、元どおり消す
      delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    });

    it('sends with sendBeacon and does not use fetch', () => {
      sendBeacon.mockReturnValue(true);
      mockHandlers[0](metric({}));
      expect(sendBeacon).toHaveBeenCalledWith(
        '/api/telemetry/vitals',
        expect.any(Blob)
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('re-sends with fetch when sendBeacon refuses the data', () => {
      sendBeacon.mockReturnValue(false);
      mockHandlers[0](metric({ id: 'v6-refused' }));
      expect(sendBeacon).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('/api/telemetry/vitals');
      expect(JSON.parse(init.body).id).toBe('v6-refused');
    });
  });
});
