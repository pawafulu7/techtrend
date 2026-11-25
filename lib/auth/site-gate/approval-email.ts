/**
 * 利用の申請を許可したことを、申請のアドレスに知らせるメール
 *
 * 送るのは、管理者が申請の一覧で「許可する」を押して、許可リストに新しく足したときだけ
 * （app/api/admin/gate-requests/[id]/approve/route.ts。2026-11-25 のユーザーの決定）。
 * 管理者がアドレスを自分で入力して追加したとき・すでに許可されていたときは送らない。
 *
 * 本文に入れるのはサイトの URL だけにする。申請のアドレスと備考は入れない（アドレスは正規化でドットを
 * 除いた形で持っているので、本人が入力した形と違って見える。備考は申請者が自由に書いた文字列）。
 */
import logger from '@/lib/logger';
import { buildEmailHtml } from '@/lib/email/layout';
import { sendEmail, type EmailMessage } from '@/lib/email/mailer';
import { summarizeError } from '@/lib/utils/sanitize-error';
import type { GateApprovalNotification } from './admin-types';
import { maskGateEmail } from './email';


/**
 * 送信を待つ上限。待つのは、送れたかどうかを管理者の画面に出すため。SMTP の接続は既定では 2 分待つので、
 * 許可のボタンが返ってこなくならないよう、ここで待つのをやめる（許可そのものは済んでいる）。
 * 送信そのものは止めないので、「送れなかった」と出したあとで届くことはありうる。その場合も、管理者が
 * 本人に直接知らせるだけで害は無い。送信の側の上限（SMTP の接続や無通信の時間）は縮めない
 * （同じ送信の設定を使う確認メールが、応答の遅い SMTP で失敗しやすくなるため）
 */
export const GATE_APPROVAL_EMAIL_TIMEOUT_MS = 10_000;

const GATE_APPROVAL_EMAIL_SUBJECT = 'TechTrend - 利用の申請が許可されました';

/** 許可の知らせの件名と本文。リンク先はサイトのトップ（入口を通ってから開く） */
export function buildGateApprovalEmail(
  siteOrigin: string
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const siteUrl = `${siteOrigin}/`;
  return {
    subject: GATE_APPROVAL_EMAIL_SUBJECT,
    html: buildEmailHtml({
      headingHtml: 'TechTrend の利用が許可されました',
      messageHtml:
        '下のボタンからサイトを開き、<br>申請したアドレスの Google アカウントでログインしてください。',
      buttonUrl: siteUrl,
      buttonLabelHtml: 'TechTrend を開く',
      noteHtml: 'このメールに心当たりがない場合は、無視してください。',
    }),
    text: `TechTrend の利用が許可されました\n\n次の URL からサイトを開き、申請したアドレスの Google アカウントでログインしてください。\n\n${siteUrl}\n\nこのメールに心当たりがない場合は、無視してください。\n\nこのメールは自動送信されています。返信はできません。`,
  };
}

/**
 * 許可の知らせを送る。throw しない（許可は済んでいるので、送信の失敗で許可の応答を失敗にしない）。
 * 送れたかどうかを返し、呼び出し元が管理者の画面に出す
 *
 * @param email 許可したアドレス（正規化済み。Gmail はドットの有無を区別しないので、本人に届く）
 * @param siteOrigin サイトの origin（入口の設定の baseOrigin）
 */
export async function sendGateApprovalEmail(
  email: string,
  siteOrigin: string
): Promise<GateApprovalNotification> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error('Sending the approval email timed out'), {
            code: 'ETIMEDOUT',
          })
        ),
      GATE_APPROVAL_EMAIL_TIMEOUT_MS
    );
  });
  try {
    const result = await Promise.race([
      sendEmail({ to: email, ...buildGateApprovalEmail(siteOrigin) }),
      timeout,
    ]);
    if (result === 'skipped') return 'none';
    if (result === 'no_provider') {
      logger.warn(
        { email: maskGateEmail(email) },
        '[GateApprovalEmail] 送信の設定が無いため、許可の通知メールを送れませんでした'
      );
      return 'failed';
    }
    logger.info(
      { email: maskGateEmail(email) },
      '[GateApprovalEmail] 許可の通知メールを送りました'
    );
    return 'sent';
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error), email: maskGateEmail(email) },
      '[GateApprovalEmail] 許可の通知メールを送れませんでした'
    );
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
