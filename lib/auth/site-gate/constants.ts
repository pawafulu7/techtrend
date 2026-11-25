/**
 * サイトの入口（Google ログインと許可リスト）の定数
 *
 * 依存を持たないモジュールにする。proxy.ts・Route Handler・画面（許可が外れるまでの秒数の文言）・
 * Playwright の spec のどれからも読むため。
 */

/** 入口を通過した応答に付けるキャッシュヘッダ（共有キャッシュに載せない）。lib/api/cache-headers.ts と共有する */
export const GATED_CACHE_CONTROL = 'private, no-store';
export const GATED_CDN_CACHE_CONTROL = 'no-store';

/** 入口用の Better Auth の basePath。アプリ内の /api/auth と分ける */
export const GATE_BASE_PATH = '/api/gate';
/** 入口用の Cookie の接頭辞。アプリ内の better-auth.* と重ならないようにする */
export const GATE_COOKIE_PREFIX = 'tt-gate';

/** ログインの開始（自前の Route Handler） */
export const GATE_START_PATH = `${GATE_BASE_PATH}/start`;
/** Google からの戻り（Better Auth に渡す） */
export const GATE_CALLBACK_PATH = `${GATE_BASE_PATH}/callback/google`;
/** 拒否・失敗のときのページ（自前の HTML。lib/auth/site-gate/error-page.ts） */
export const GATE_ERROR_PATH = `${GATE_BASE_PATH}/error`;

/**
 * 利用の申請の受け付け（拒否のページのフォームの送り先。自前の Route Handler。POST だけを入口の外から通す）。
 * lib/auth/site-gate/evaluate.ts の isGatePublicRequest
 */
export const GATE_REQUEST_PATH = `${GATE_BASE_PATH}/request`;

/** 入口を通さずに届けてよい経路（GET・HEAD だけ）。ここ以外の /api/gate/* は Route Handler が 404 にする */
export const GATE_PUBLIC_PATHS: readonly string[] = [
  GATE_START_PATH,
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
];

/**
 * 戻り先の上限。戻り先は state の Cookie に暗号化して入り（hex で 2 倍になる）、128 文字の codeVerifier なども
 * 入るので、概算で 1,750 文字前後を超えると 4KB を超えて捨てられ、その人が入口を通れなくなる。余裕を持って 1,024 にする
 */
export const GATE_CALLBACK_MAX_LENGTH = 1024;

/** 入口のログインの期限（7 日）。最初のログインから数え、アクセスしても延ばさない */
export const GATE_SESSION_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * 許可の結果をプロセス内に持つ秒数。許可リストから外したアドレスは、最長でこの秒数だけ入れ続ける。
 * 管理画面の文言（「30 秒ほどで入れなくなります」）もこの値から作る
 */
export const GATE_ALLOW_CACHE_TTL_SEC = 30;

/** 許可リストに置ける件数の上限（設定で固定するアドレスは数えない） */
export const GATE_ALLOWLIST_MAX_ENTRIES = 100;

/**
 * 管理画面の一覧に返す件数の上限。追加の上限より大きくする（同時の追加や手で流す SQL で上限を超えた行も、
 * 一覧に出して画面から消せるように。超えた行も入口の照合では許可される）
 */
export const GATE_ALLOWLIST_LIST_LIMIT = 1000;

/** 利用の申請の備考の上限（DB の列は VARCHAR(500)。JS の length は PostgreSQL の文字数以上になる） */
export const GATE_REQUEST_NOTE_MAX_LENGTH = 500;

/**
 * 対応待ちの申請を置ける件数（1 つのアドレスにつき 1 件）。申請を送れるのは Google のログインを通って
 * 拒否された人だけで、IP ごとに 10 回/時まで（lib/config/rate-limits.ts の write:gate-request）
 */
export const GATE_REQUEST_MAX_PENDING = 100;

/** 管理画面の申請の一覧に返す件数の上限（置ける件数より大きくし、超えた行も画面から消せるようにする） */
export const GATE_REQUEST_LIST_LIMIT = 200;

/**
 * 入口が API の要求を拒んだときの JSON の code。画面がアプリ内のログイン切れや権限の不足と見分けるために使う
 */
export const GATE_ERROR_CODES = {
  /** 入口のログイン状態が無い・切れた（401） */
  sessionRequired: 'GATE_SESSION_REQUIRED',
  /** 入口のログイン状態はあるが、許可リストから外された（403） */
  notAllowed: 'GATE_NOT_ALLOWED',
} as const;
