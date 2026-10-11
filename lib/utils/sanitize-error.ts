/**
 * Error / message サニタイズユーティリティ
 *
 * pino の `err` シリアライザを経由しない構造化ログフィールド
 * (例: errorMessage) でも API キー・Bearer token を除去できるよう、
 * logger 非依存のピュア関数として独立モジュール化する。
 */

/**
 * Remove sensitive tokens (API keys, Bearer tokens) from a free-form string.
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      // OpenAI API keys: legacy (sk-XXXX) と hyphenated (sk-proj-, sk-svcacct- 等)
      // 例: sk-proj-abcdefghij1234567890ABCDEFGHIJ
      .replace(
        /sk-(?:[a-zA-Z0-9]+-){0,3}[a-zA-Z0-9]{20,}/g,
        '[REDACTED:API_KEY]'
      )
      // Gemini API keys (pattern: AIza...)
      .replace(/AIza[a-zA-Z0-9_\-]{35}/g, '[REDACTED:GEMINI_KEY]')
      // Bearer tokens (including JWT with dots and padding)
      .replace(/Bearer\s+[a-zA-Z0-9_.\-=]+/gi, 'Bearer [REDACTED]')
  );
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,32}$/;
// frame は「at 関数名 (ファイル:行:列)」か「at ファイル:行:列」の形だけを通す。ファイルは
// 絶対パス・file:// ・node: の内部モジュールに限り、`:` を含む URL などの任意の文字列は通さない
const STACK_LOCATION = String.raw`(?:node:[\w/.-]+|(?:file:\/\/)?\/[\w./@+-]+):\d+:\d+`;
const STACK_FRAME = new RegExp(
  String.raw`^ {4}at (?:(?:async |new )?[\w$.<>[\] ]{1,200} \(${STACK_LOCATION}\)|${STACK_LOCATION})$`
);
const MAX_CAUSE_DEPTH = 3;
const MAX_STACK_FRAMES = 10;

// 別の realm（vm・Jest の環境）で作られた Error は instanceof で拾えないので、内部の型も見る
function isError(value: unknown): value is Error & Record<string, unknown> {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === '[object Error]'
  );
}

function describeOne(value: unknown): string {
  if (!isError(value)) {
    return `non-Error (${value === null ? 'null' : typeof value})`;
  }

  const parts = [
    typeof value.name === 'string' && SAFE_ERROR_NAME.test(value.name)
      ? value.name
      : 'Error',
  ];
  for (const key of ['code', 'errorCode'] as const) {
    const code = value[key];
    if (typeof code === 'string' && SAFE_ERROR_CODE.test(code)) {
      parts.push(`${key}=${code}`);
    } else if (typeof code === 'number' && Number.isInteger(code)) {
      parts.push(`${key}=${code}`);
    }
  }
  for (const key of ['status', 'statusCode'] as const) {
    const status = value[key];
    if (typeof status === 'number' && Number.isInteger(status)) {
      parts.push(`${key}=${status}`);
    }
  }
  return parts.join(' ');
}

/**
 * 例外を、種類（name）とコード（code・errorCode・status）だけの形にする。message は出さない。
 * DB の接続エラーの message には接続先（ホスト・DB 名・ロール）が入り、定期実行のログは
 * 公開リポジトリの GitHub Actions に残るため。置換で伏せる方式は表記の揺れで漏れるので、
 * 決まった形に合う値だけを出す。stack は message の後の frame の行のうち、関数名とファイルの位置だけの
 * 行を出す。
 */
export function summarizeError(
  error: unknown,
  options: { stack?: boolean } = {}
): string {
  // catch の中で呼ぶので、name の getter などが投げても外へ伝えない（元の失敗を記録できなくなるため）
  try {
    return summarizeErrorUnsafe(error, options);
  } catch {
    return 'Error (summary unavailable)';
  }
}

function summarizeErrorUnsafe(
  error: unknown,
  options: { stack?: boolean }
): string {
  const chain: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    // cause が無い（undefined・null）なら辿るのをやめる。投げられた値そのものは null でも出す
    if (depth > 0 && (current === undefined || current === null)) break;
    chain.push(describeOne(current));
    current = isError(current) ? current.cause : undefined;
  }
  let summary = chain.join(' <- cause: ');

  if (
    options.stack &&
    isError(error) &&
    typeof error.stack === 'string'
  ) {
    // V8 の stack は「name: message」の後に frame が続く。message が複数行でも
    // frame と取り違えないよう、先頭の String(error) を外してから frame の行を拾う
    const head = String(error);
    const rest = error.stack.startsWith(head)
      ? error.stack.slice(head.length)
      : '';
    const frames = rest
      .split('\n')
      .filter((line) => STACK_FRAME.test(line))
      .slice(0, MAX_STACK_FRAMES);
    if (frames.length > 0) summary += `\n${frames.join('\n')}`;
  }
  return summary;
}

/**
 * Sanitize error objects to remove sensitive information.
 * Handles API keys that may appear in error messages (not covered by redact).
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitizedMessage = sanitizeErrorMessage(error.message);
    const sanitizedStack = error.stack
      ? sanitizeErrorMessage(error.stack)
      : undefined;

    return {
      name: error.name,
      message: sanitizedMessage,
      // Include stack trace only in development
      ...(process.env.NODE_ENV === 'development' &&
        sanitizedStack && {
          stack: sanitizedStack,
        }),
    };
  }

  return error;
}
