import { renderGateErrorPage } from '@/lib/auth/site-gate/error-page';

describe('renderGateErrorPage', () => {
  it.each([
    ['not_allowed', 403, 'ログインできません', '登録済みのアカウントで入る'],
    ['email_not_verified', 403, 'ログインできません', '別のアカウントで入る'],
    ['temporarily_unavailable', 503, 'いまは確かめられません', 'もう一度ログインする'],
    ['access_denied', 400, 'ログインを取り消しました', 'もう一度ログインする'],
    ['state_mismatch', 400, 'ログインを続けられません', 'もう一度ログインする'],
    ['please_restart_the_process', 400, 'ログインを続けられません', 'もう一度ログインする'],
    ['invalid_code', 400, 'ログインできません', 'もう一度ログインする'],
    [null, 400, 'ログインできません', 'もう一度ログインする'],
  ] as const)('%p → %d %s', (code, status, title, action) => {
    const page = renderGateErrorPage(code);
    expect(page.status).toBe(status);
    expect(page.html).toContain(`<h1>${title}</h1>`);
    expect(page.html).toContain(`>${action}</a>`);
    expect(page.html).toContain('<html lang="ja">');
    expect(page.html).toContain('<meta name="robots" content="noindex">');
  });

  it.each([
    'not_allowed',
    'email_not_verified',
    'temporarily_unavailable',
    'access_denied',
    'state_mismatch',
    null,
  ])('keeps titles within 12 and sentences within 18 characters (%p)', (code) => {
    const { html } = renderGateErrorPage(code);
    const title = html.match(/<h1>(.*?)<\/h1>/)![1];
    expect(title.length).toBeLessThanOrEqual(12);
    const lines = [...html.matchAll(/<div class="lines">(.*?)<\/div>/g)][0][1]
      .split('</p>')
      .filter(Boolean)
      .map((p) => p.replace('<p>', ''));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(18);
  });

  it('links only to the gate start on the same site, without external links or scripts', () => {
    const { html } = renderGateErrorPage('not_allowed');
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/api/gate/start?callbackURL=%2F']);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('Ask AI');
  });

  it('shows unknown for codes it does not know, without echoing them', () => {
    const { html } = renderGateErrorPage('<script>alert(1)</script>');
    expect(html).toContain('エラーのコード: unknown');
    expect(html).not.toContain('alert(1)');
    expect(renderGateErrorPage('Call_this_number_now').html).not.toContain('Call_this_number_now');
  });

  it('follows the dark color scheme of the site', () => {
    const { html } = renderGateErrorPage('not_allowed');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('--primary:#3A3FC0');
    expect(html).toContain('--primary:#A3ADFF');
  });
});
