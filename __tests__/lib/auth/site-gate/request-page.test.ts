import {
  renderGateRequestResultPage,
  type GateRequestResult,
} from '@/lib/auth/site-gate/request-page';

const RESULTS: [GateRequestResult, number, string, string][] = [
  ['received', 200, '申請を送りました', 'もう一度ログインする'],
  ['already_allowed', 200, '登録済みのアカウントです', 'ログインする'],
  ['expired', 400, '申請を送れませんでした', 'もう一度ログインする'],
  ['unreadable', 400, '申請を送れませんでした', 'もう一度ログインする'],
  ['rate_limited', 429, '申請を送れませんでした', 'もう一度ログインする'],
  ['full', 503, 'いまは申請を送れません', 'もう一度ログインする'],
  ['unavailable', 503, 'いまは申請を送れません', 'もう一度ログインする'],
];

describe('renderGateRequestResultPage', () => {
  it.each(RESULTS)('%s → %d %s', (result, status, title, action) => {
    const page = renderGateRequestResultPage(result);
    expect(page.status).toBe(status);
    expect(page.html).toContain(`<h1>${title}</h1>`);
    expect(page.html).toContain(`>${action}</a>`);
    expect(page.html).toContain('<meta name="robots" content="noindex">');
    // 誰の申請か分からないときは、アカウントの帯を出さない
    expect(page.html).not.toContain('class="account"');
  });

  it.each(RESULTS)('keeps the title within 12 and sentences within 18 characters (%s)', (result) => {
    const { html } = renderGateRequestResultPage(result);
    expect(html.match(/<h1>(.*?)<\/h1>/)![1].length).toBeLessThanOrEqual(12);
    const lines = html
      .match(/<div class="lines">(.*?)<\/div>/)![1]
      .split('</p>')
      .filter(Boolean)
      .map((p) => p.replace('<p>', ''));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(18);
  });

  it('shows the account, escaped', () => {
    const { html } = renderGateRequestResultPage('received', 'taro.suzuki@gmail.com');
    expect(html).toContain('<p class="account">taro.suzuki@gmail.com</p>');
    expect(renderGateRequestResultPage('received', '<b>x</b>').html).toContain(
      '<p class="account">&lt;b&gt;x&lt;/b&gt;</p>'
    );
  });

  it('links only to the gate start on the same site, without scripts', () => {
    const { html } = renderGateRequestResultPage('received', 'friend@gmail.com');
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([
      '/api/gate/start?callbackURL=%2F',
    ]);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
  });
});
