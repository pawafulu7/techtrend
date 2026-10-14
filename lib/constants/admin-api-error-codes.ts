// 管理画面の API が返すエラーコード。画面はこのコードで文言を選ぶ（issue #797）。
// サーバーと画面の両方がここを参照し、綴りのずれで文言が汎用のものに落ちないようにする

export const ADMIN_API_ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
  ALREADY_DEACTIVATED: 'ALREADY_DEACTIVATED',
  LAST_ADMIN: 'LAST_ADMIN',
  /** 管理者のロールが無い（lib/middleware/with-admin-auth.ts の 403） */
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  /** 操作している本人が無効化されている（lib/middleware/with-admin-auth.ts の 401） */
  USER_DELETED: 'USER_DELETED',
} as const;

export type AdminApiErrorCode =
  (typeof ADMIN_API_ERROR_CODES)[keyof typeof ADMIN_API_ERROR_CODES];
