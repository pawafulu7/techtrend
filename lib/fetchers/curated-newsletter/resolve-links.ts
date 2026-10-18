/**
 * Cooperpress の記事リンク（`<転送ホスト>/link/<数字>/rss`）を、記事の URL に直す。
 *
 * 設定した転送ホストにだけ、`redirect: 'manual'` の HEAD で1回問い合わせ、Location を読む。
 * Location の先（記事ページ）には問い合わせない。記事ページは、保存の後に enricher が
 * 転送の各段を SSRF の検証に通して取る（lib/utils/url/safe-redirect.ts）。
 * 問い合わせ先は設定の固定のホストだけなので、この問い合わせに SSRF の検証は付けない。
 *
 * 締め切りを過ぎたら中断し、新しい問い合わせを始めず、その時点で解決できた分を写して返す
 * （Promise.race は負けた処理を止めないため）。リンクの順は呼び出し側が実行ごとに無作為に
 * 並べる（締め切りで残ったリンクに、次の実行で順番が回るように）。
 */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TechTrend/1.0; +https://techtrend.example.com/bot)',
};

export interface ResolveLinksOptions {
  /** 問い合わせてよい転送ホストのオリジン（例: https://javascriptweekly.com） */
  redirectOrigin: string;
  /** 同時に問い合わせる数 */
  concurrency: number;
  /** 1回の問い合わせの時間の上限 */
  requestTimeoutMs: number;
  /** 同じワーカーが次の問い合わせを始めるまでの間隔 */
  intervalMs: number;
  /** 締め切り（エポックミリ秒） */
  deadlineAt: number;
  now?: () => number;
}

export interface ResolveLinksOutcome {
  /** 転送 URL → 記事の URL */
  resolved: Map<string, string>;
  /** 問い合わせて失敗した数 */
  failed: number;
  /** 締め切りで問い合わせを終えられなかった数 */
  unresolved: number;
}

export async function resolveRedirectLinks(
  hrefs: readonly string[],
  options: ResolveLinksOptions
): Promise<ResolveLinksOutcome> {
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const resolved = new Map<string, string>();
  let failed = 0;
  let next = 0;
  let stopped = false;

  const pastDeadline = () => now() >= options.deadlineAt;
  const worker = async () => {
    // 締め切りの後は新しい問い合わせを始めない（setTimeout の締め切りより先に動くことがあるため、時刻でも見る）
    while (!stopped && !pastDeadline() && next < hrefs.length) {
      const href = hrefs[next++];
      try {
        const url = await resolveOne(href, options, controller.signal);
        if (!stopped) resolved.set(href, url);
      } catch {
        if (!stopped) failed++;
      }
      if (!stopped && next < hrefs.length && options.intervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
      }
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, options.deadlineAt - now()));
  });
  const workers = Array.from(
    { length: Math.min(options.concurrency, hrefs.length) },
    worker
  );

  try {
    await Promise.race([Promise.all(workers), deadline]);
  } finally {
    clearTimeout(timer);
    stopped = true;
    controller.abort();
  }

  const snapshot = new Map(resolved);
  const failedAtStop = failed;
  return {
    resolved: snapshot,
    failed: failedAtStop,
    unresolved: hrefs.length - snapshot.size - failedAtStop,
  };
}

async function resolveOne(
  href: string,
  options: ResolveLinksOptions,
  stopSignal: AbortSignal
): Promise<string> {
  if (new URL(href).origin !== options.redirectOrigin) {
    throw new Error(`Unexpected link origin: ${href}`);
  }

  const request = (method: 'HEAD' | 'GET') =>
    fetch(href, {
      method,
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.any([
        stopSignal,
        AbortSignal.timeout(options.requestTimeoutMs),
      ]),
    });

  let response = await request('HEAD');
  if (response.status === 405 || response.status === 501) {
    await discardBody(response);
    response = await request('GET');
  }
  await discardBody(response);

  const location = REDIRECT_STATUSES.has(response.status)
    ? response.headers.get('location')
    : null;
  if (!location) {
    throw new Error(`Link did not redirect (HTTP ${response.status}): ${href}`);
  }

  const target = new URL(location, href);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(
      `Disallowed redirect protocol "${target.protocol}": ${href}`
    );
  }
  if (target.username || target.password) {
    throw new Error(`Redirect location with credentials: ${href}`);
  }
  return target.toString();
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 本文の破棄の失敗は判定に影響させない
  }
}
