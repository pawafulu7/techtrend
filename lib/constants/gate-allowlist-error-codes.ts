// 管理画面の「サイトに入れるアカウント」の API が返すエラーコード。画面はこのコードで文言を選ぶ。
// サーバーと画面の両方がここを参照し、綴りのずれで文言が汎用のものに落ちないようにする。
// ユーザー管理のコード（admin-api-error-codes.ts）とは分ける（あちらの文言の表が satisfies で全コードを要求するため）

export const GATE_ALLOWLIST_ERROR_CODES = {
  /** Gmail（@gmail.com）のアドレスではない */
  NOT_GMAIL: 'NOT_GMAIL',
  /** 設定（環境変数）で固定したアドレスと同じ */
  ALREADY_FIXED: 'ALREADY_FIXED',
  /** すでに一覧にある */
  ALREADY_LISTED: 'ALREADY_LISTED',
  /** 件数の上限に達した */
  LIST_FULL: 'LIST_FULL',
  /** 一覧に無い（すでに削除された） */
  ENTRY_NOT_FOUND: 'ENTRY_NOT_FOUND',
  /** 利用の申請が無い（別の管理者が先に許可・却下した） */
  REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
  /** 管理者が今サイトに入るのに使っているアカウントは削除できない */
  CANNOT_REMOVE_CURRENT_ACCOUNT: 'CANNOT_REMOVE_CURRENT_ACCOUNT',
} as const;

export type GateAllowlistErrorCode =
  (typeof GATE_ALLOWLIST_ERROR_CODES)[keyof typeof GATE_ALLOWLIST_ERROR_CODES];
