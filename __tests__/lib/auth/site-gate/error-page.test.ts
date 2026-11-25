import {
  renderGateErrorPage,
  renderGateRequestFormPage,
} from '@/lib/auth/site-gate/error-page';

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

  describe('利用の申請（未登録で拒否されたアカウントが分かるとき）', () => {
    const FORM = { kind: 'form', account: 'taro.suzuki@gmail.com' } as const;

    it('shows a form with the rejected account filled in an editable address field, and the note', () => {
      const { status, html } = renderGateErrorPage('not_allowed', FORM);
      expect(status).toBe(403);
      expect(html).toContain('<h1>ログインできません</h1>');
      expect(html).toContain('<form class="request" method="post" action="/api/gate/request">');
      // Google で選んだアカウントを入れておき、別の Gmail アドレスに書き換えられる（readonly・hidden にしない）
      expect([...html.matchAll(/<input[^>]*>/g)].map((m) => m[0])).toEqual([
        '<input id="account" name="account" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required maxlength="254" value="taro.suzuki@gmail.com" aria-describedby="account-hint">',
      ]);
      expect(html).toContain('<label class="label" for="account">申請するアカウント（Gmail アドレス）</label>');
      expect(html).toContain('別の Gmail アドレスで申請するときは、書き換えてください。');
      expect(html.match(/<textarea[^>]*>/)![0]).toBe(
        '<textarea id="note" name="note" rows="3" maxlength="500" aria-describedby="note-hint">'
      );
      expect(html).toContain('<button class="action" type="submit">利用を申請する</button>');
      expect([...html.matchAll(/ name="([^"]*)"/g)].map((m) => m[1])).toEqual([
        'viewport',
        'robots',
        'account',
        'note',
      ]);
      // 入り直しのリンクは残す（主のボタンは申請なので、副のボタンにする）
      expect(html).toContain(
        '<a class="action secondary" href="/api/gate/start?callbackURL=%2F">登録済みのアカウントで入る</a>'
      );
      expect(html).toContain('エラーのコード: not_allowed');
      expect(html).not.toContain('<script');
    });

    it('keeps the sentences within 18 characters', () => {
      const { html } = renderGateErrorPage('not_allowed', FORM);
      const lines = html
        .match(/<div class="lines">(.*?)<\/div>/)![1]
        .split('</p>')
        .filter(Boolean)
        .map((p) => p.replace('<p>', ''));
      expect(lines).toEqual(['このサイトに未登録のアカウントです。', '利用の申請を管理者に送れます。']);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(18);
    });

    it('escapes the account, the note and the errors', () => {
      const { status, html } = renderGateRequestFormPage(
        {
          kind: 'form',
          account: '"><img src=x>',
          note: '</textarea><script>alert(1)</script>',
          accountError: '<u>Gmail ではありません</u>',
          noteError: '<b>長すぎます</b>',
        },
        400
      );
      expect(status).toBe(400);
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<b>');
      expect(html).not.toContain('<u>');
      expect(html).toContain('value="&quot;&gt;&lt;img src=x&gt;"');
      expect(html).toContain('&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>');
      expect(html).toContain(
        '<p class="invalid" id="account-error">&lt;u&gt;Gmail ではありません&lt;/u&gt;</p>'
      );
      expect(html).toContain('<p class="invalid" id="note-error">&lt;b&gt;長すぎます&lt;/b&gt;</p>');
    });

    it('marks the invalid fields and moves the focus to the first one (no JS: autofocus)', () => {
      const both = renderGateRequestFormPage(
        { kind: 'form', account: 'someone@example.com', accountError: 'x', noteError: 'y' },
        400
      ).html;
      expect(both.match(/<input[^>]*>/)![0]).toContain(
        'aria-describedby="account-error account-hint" aria-invalid="true" autofocus>'
      );
      // 両方に誤りがあるときは、上の欄（アドレス）だけにフォーカスを移す
      expect(both.match(/<textarea[^>]*>/)![0]).toContain(
        'aria-describedby="note-error note-hint" aria-invalid="true">'
      );

      const noteOnly = renderGateRequestFormPage(
        { kind: 'form', account: 'friend@gmail.com', noteError: 'y' },
        400
      ).html;
      expect(noteOnly.match(/<input[^>]*>/)![0]).toContain('aria-describedby="account-hint">');
      expect(noteOnly.match(/<textarea[^>]*>/)![0]).toContain(
        'aria-describedby="note-error note-hint" aria-invalid="true" autofocus>'
      );
    });

    it('keeps a note that starts with a line break (a textarea drops the first one)', () => {
      const { html } = renderGateRequestFormPage(
        { kind: 'form', account: 'friend@gmail.com', note: '\n二行目から' },
        400
      );
      expect(html).toContain('>\n\n二行目から</textarea>');
    });

    it('shows no form when the account has already requested', () => {
      const { status, html } = renderGateErrorPage('not_allowed', {
        kind: 'pending',
        account: 'taro.suzuki@gmail.com',
      });
      expect(status).toBe(403);
      expect(html).toContain('<h1>まだログインできません</h1>');
      expect(html).toContain('<p class="account">taro.suzuki@gmail.com</p>');
      expect(html).toContain('>別のアカウントで入る</a>');
      expect(html).not.toContain('<form');
    });

    it.each(['email_not_verified', 'access_denied', 'temporarily_unavailable', null])(
      'does not offer the request for other errors (%p)',
      (code) => {
        const { html } = renderGateErrorPage(code, FORM);
        expect(html).not.toContain('<form');
        expect(html).not.toContain('taro.suzuki@gmail.com');
        expect(html).toBe(renderGateErrorPage(code).html);
      }
    );
  });

  it('follows the dark color scheme of the site', () => {
    const { html } = renderGateErrorPage('not_allowed');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('--primary:#3A3FC0');
    expect(html).toContain('--primary:#A3ADFF');
  });
});
