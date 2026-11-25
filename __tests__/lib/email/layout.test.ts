/**
 * lib/email/layout.ts - メールの HTML の枠
 */
import { buildEmailHtml } from '@/lib/email/layout';

describe('buildEmailHtml', () => {
  it('keeps the verification email as it was before the layout was shared, except for escaping the link', () => {
    // 枠を切り出す前の lib/auth/auth.ts の buildVerificationEmailHtml の出力。違いは、リンク先の & を
    // 属性値として &amp; にしたことだけ（メールソフトは & に戻して開く）
    const url =
      'https://techtrend.example.com/api/auth/verify-email?token=abc&callbackURL=%2F';
    const escapedHost = 'techtrend&#8203;.example&#8203;.com';
    const before = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <tr><td style="padding:40px 30px;text-align:center;">
    <h1 style="color:#333333;margin:0 0 20px 0;font-size:24px;">TechTrend メールアドレスの確認</h1>
    <p style="color:#666666;margin:0 0 30px 0;font-size:16px;line-height:1.5;">
      <strong>${escapedHost}</strong> へのサインインを完了するには、<br>以下のボタンをクリックしてください。
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      <td style="background-color:#0070f3;border-radius:6px;">
        <a href="${url.replace(/&/g, '&amp;')}" target="_blank" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:500;">メールアドレスを確認する</a>
      </td>
    </tr></table>
    <p style="color:#999999;margin:30px 0 0 0;font-size:14px;">このメールに心当たりがない場合は、無視してください。<br>リンクは24時間有効です。</p>
  </td></tr>
  <tr><td style="padding:20px 30px;background-color:#f8f8f8;border-top:1px solid #e0e0e0;text-align:center;border-radius:0 0 8px 8px;">
    <p style="color:#999999;margin:0;font-size:12px;">このメールは自動送信されています。返信はできません。</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

    expect(
      buildEmailHtml({
        headingHtml: 'TechTrend メールアドレスの確認',
        messageHtml: `<strong>${escapedHost}</strong> へのサインインを完了するには、<br>以下のボタンをクリックしてください。`,
        buttonUrl: url,
        buttonLabelHtml: 'メールアドレスを確認する',
        noteHtml:
          'このメールに心当たりがない場合は、無視してください。<br>リンクは24時間有効です。',
      })
    ).toBe(before);
  });

  it('escapes the link so that a URL cannot break out of the attribute', () => {
    const html = buildEmailHtml({
      headingHtml: '見出し',
      messageHtml: '説明',
      buttonUrl: 'https://example.com/?a=1&b="><script>alert(1)</script>',
      buttonLabelHtml: 'ボタン',
      noteHtml: '補足',
    });
    expect(html).toContain(
      'href="https://example.com/?a=1&amp;b=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'
    );
    expect(html).not.toContain('<script>');
  });

  it('puts each part in its own place', () => {
    const html = buildEmailHtml({
      headingHtml: '見出し',
      messageHtml: '説明',
      buttonUrl: 'https://example.com/',
      buttonLabelHtml: 'ボタン',
      noteHtml: '補足',
    });
    expect(html).toContain('>見出し</h1>');
    expect(html).toMatch(/<p [^>]*>\s*説明\s*<\/p>/);
    expect(html).toMatch(
      /<a href="https:\/\/example\.com\/" [^>]*>ボタン<\/a>/
    );
    expect(html).toContain('>補足</p>');
  });
});
