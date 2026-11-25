/**
 * 利用の申請を受け付けたあとのページ（POST /api/gate/request の応答。外枠は page-shell.ts）
 *
 * 拒否のページ（error-page.ts）は JS を使わないので、フォームは普通の送信で届き、応答もページで返す。
 */
import { gateAccountBox, gateStartLink, renderGatePage } from './page-shell';

export type GateRequestResult =
  /** 申請を保存した */
  | 'received'
  /** 申請する前に許可されていた（管理者が先に追加した） */
  | 'already_allowed'
  /** 誰の申請か分からない（申請用の Cookie が無い・期限が切れた） */
  | 'expired'
  /** 送信の内容を読み取れない */
  | 'unreadable'
  /** 送信の回数が多い */
  | 'rate_limited'
  /** 対応待ちの申請が上限に達している */
  | 'full'
  /** 保存・確認ができない（DB の障害など） */
  | 'unavailable';

interface ResultContent {
  status: number;
  title: string;
  lines: readonly string[];
  action: string;
}

const RETRY = 'もう一度ログインする';

const CONTENTS: Record<GateRequestResult, ResultContent> = {
  received: {
    status: 200,
    title: '申請を送りました',
    lines: ['管理者が申請を確認します。', '許可されるとログインできます。'],
    action: RETRY,
  },
  already_allowed: {
    status: 200,
    title: '登録済みのアカウントです',
    lines: ['このアカウントは登録済みです。', 'そのままログインできます。'],
    action: 'ログインする',
  },
  expired: {
    status: 400,
    title: '申請を送れませんでした',
    lines: ['申請の手続きが切れました。', 'もう一度ログインしてください。'],
    action: RETRY,
  },
  unreadable: {
    status: 400,
    title: '申請を送れませんでした',
    lines: ['送信の内容を読み取れませんでした。', 'もう一度ログインしてください。'],
    action: RETRY,
  },
  rate_limited: {
    status: 429,
    title: '申請を送れませんでした',
    lines: ['送信の回数が多すぎます。', '時間をおいて送り直してください。'],
    action: RETRY,
  },
  full: {
    status: 503,
    title: 'いまは申請を送れません',
    lines: ['申請の受け付けが混み合っています。', '日をおいて送り直してください。'],
    action: RETRY,
  },
  unavailable: {
    status: 503,
    title: 'いまは申請を送れません',
    lines: ['申請を保存できませんでした。', '少し待って送り直してください。'],
    action: RETRY,
  },
};

/** account は、誰の申請かが分かっているときだけ渡す（結果のページに出す） */
export function renderGateRequestResultPage(
  result: GateRequestResult,
  account?: string
): { status: number; html: string } {
  const content = CONTENTS[result];
  return renderGatePage({
    status: content.status,
    title: content.title,
    lines: content.lines,
    bodyHtml: [
      account === undefined ? '' : gateAccountBox(account),
      gateStartLink(content.action),
    ]
      .filter(Boolean)
      .join('\n'),
  });
}
