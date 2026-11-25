/**
 * サイトから送るメールの HTML の枠（見出し・説明・ボタン・補足・フッター）
 *
 * 名前が Html で終わる値は HTML としてそのまま埋める。呼び出し側が、外から来た値をエスケープしてから渡す。
 * ボタンのリンク先（buttonUrl）は URL をそのまま受け取り、ここでエスケープする。
 */
import { escapeHtml } from '@/lib/utils/escape-html';

export interface EmailLayoutContent {
  /** 見出し */
  headingHtml: string;
  /** 見出しの下の説明 */
  messageHtml: string;
  /** ボタンのリンク先（生の URL。属性値として埋めるときにエスケープする） */
  buttonUrl: string;
  /** ボタンの文字 */
  buttonLabelHtml: string;
  /** ボタンの下の補足 */
  noteHtml: string;
}

export function buildEmailHtml(content: EmailLayoutContent): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <tr><td style="padding:40px 30px;text-align:center;">
    <h1 style="color:#333333;margin:0 0 20px 0;font-size:24px;">${content.headingHtml}</h1>
    <p style="color:#666666;margin:0 0 30px 0;font-size:16px;line-height:1.5;">
      ${content.messageHtml}
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      <td style="background-color:#0070f3;border-radius:6px;">
        <a href="${escapeHtml(content.buttonUrl)}" target="_blank" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:500;">${content.buttonLabelHtml}</a>
      </td>
    </tr></table>
    <p style="color:#999999;margin:30px 0 0 0;font-size:14px;">${content.noteHtml}</p>
  </td></tr>
  <tr><td style="padding:20px 30px;background-color:#f8f8f8;border-top:1px solid #e0e0e0;text-align:center;border-radius:0 0 8px 8px;">
    <p style="color:#999999;margin:0;font-size:12px;">このメールは自動送信されています。返信はできません。</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}
