/**
 * 入口の許可リストの照合
 *
 * Next.js の proxy はアプリ本体と別に動き、共有のモジュールやグローバルに頼れない
 * （node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md）。管理 API から
 * キャッシュを捨てても proxy には届かないので、キャッシュには「許可」の結果だけを持ち、無ければ DB を引き直す。
 * 足したアドレスはすぐ入れ（キャッシュに無い → DB を引く）、外したアドレスはキャッシュが切れる
 * GATE_ALLOW_CACHE_TTL_SEC 秒後に入れなくなる。
 *
 * proxy からは、入口の Cookie を確かめたあとにだけ動的 import で読む（未ログインのアクセスでは DB に触れない）。
 */
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/config/env';
import { GATE_ALLOW_CACHE_TTL_SEC } from './constants';
import { normalizeGateEmail } from './email';
import type { GateAccess } from './gate-auth-options';

export type { GateAccess };

/** DB の照合が失敗した・時間切れになった。呼び出し元は拒否の側に倒す */
export class GateAllowlistUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GateAllowlistUnavailableError';
  }
}

/** 照合の失敗を覚える時間。障害中にリクエストごとに DB を待たないため */
const FAILURE_MEMORY_MS = 5_000;
/**
 * 行の追加時刻（管理 API を処理したインスタンスの時計。Prisma の @default(now()) が付ける）と、
 * ログイン状態の作成時刻（ログインを処理したインスタンスの時計）のずれの許容幅。どちらもアプリの時計
 * （Vercel では同期済み）なので小さくする。この幅の内に外して足し直すと、外す前のログイン状態が残りの期限まで通るため
 */
const CLOCK_SKEW_MS = 5_000;
/** キャッシュの件数がこれを超えたら、切れたものを捨てる（許可リストの上限は 100 件） */
const CACHE_PRUNE_THRESHOLD = 500;

interface AllowEntry {
  /** 行の追加時刻 */
  rowCreatedAt: Date;
  expiresAt: number;
}

const allowCache = new Map<string, AllowEntry>();
interface LookupResult {
  rowCreatedAt: Date | null;
  /** 照合を始めた時刻。キャッシュの期限はここから数える（遅れて返った古い結果を、外してから 30 秒より長く持たないように） */
  startedAt: number;
}

const inFlight = new Map<string, Promise<LookupResult>>();
let lastFailureAt: number | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new GateAllowlistUnavailableError(
            `allowlist lookup timed out after ${ms}ms`
          )
        ),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 行の追加時刻（行が無ければ null）と照合を始めた時刻。同じアドレスの照合が同時に来たら、DB へは 1 本だけ送る */
function lookupRowCreatedAt(email: string): Promise<LookupResult> {
  const running = inFlight.get(email);
  if (running) return running;

  // 照合の上限はアプリの DB の接続の上限にそろえる（本番の DB が止まっていて起動を待つ間に、入口だけが先に 503 にならないように）
  const timeoutMs = Math.max(1, env.DB_CONNECT_TIMEOUT) * 1000;
  const startedAt = Date.now();
  const promise = withTimeout(
    prisma.gateAllowedEmail.findUnique({
      where: { email },
      select: { createdAt: true },
    }),
    timeoutMs
  )
    .then((row) => ({ rowCreatedAt: row?.createdAt ?? null, startedAt }))
    .finally(() => {
      inFlight.delete(email);
    });
  inFlight.set(email, promise);
  return promise;
}

function pruneExpired(now: number): void {
  if (allowCache.size <= CACHE_PRUNE_THRESHOLD) return;
  for (const [email, entry] of allowCache) {
    if (entry.expiresAt <= now) allowCache.delete(email);
  }
}

/**
 * 一度外したアドレスを足し直したとき、外す前に作られた入口のログイン状態（最長 7 日）がまた通るのを防ぐ。
 * 落ちたときは「許可リストに無い」ではなく「ログイン状態が無効」として扱う（足し直した人に拒否を見せないため）
 */
function judgeRow(
  rowCreatedAt: Date,
  sessionCreatedAt: Date | undefined
): GateAccess {
  if (
    sessionCreatedAt !== undefined &&
    sessionCreatedAt.getTime() + CLOCK_SKEW_MS < rowCreatedAt.getTime()
  ) {
    return 'stale_session';
  }
  return 'allowed';
}

export interface CheckGateEmailAccessOptions {
  /** 設定で固定した許可アドレス（正規化済み）。当たれば DB を読まない */
  fixedEmails: readonly string[];
  /** 入口のログイン状態の作成時刻。ログインの途中（まだ無い）は省く */
  sessionCreatedAt?: Date;
}

/**
 * アドレスが許可されているか。
 *
 * 1. 設定で固定したアドレスなら、DB を読まずに許可する（DB の障害でも固定の管理者は入れる）
 * 2. プロセス内の「許可済み」のキャッシュ（GATE_ALLOW_CACHE_TTL_SEC 秒）に当たれば許可する
 * 3. DB を一意索引で引く。あれば許可してキャッシュに入れる。拒否の結果は持たない
 *
 * DB の失敗・時間切れは GateAllowlistUnavailableError を投げ、その失敗を FAILURE_MEMORY_MS の間覚えて、
 * その間は DB を叩かずにすぐ投げる。
 */
export async function checkGateEmailAccess(
  rawEmail: string,
  options: CheckGateEmailAccessOptions
): Promise<GateAccess> {
  const email = normalizeGateEmail(rawEmail);
  if (email === null) return 'not_allowed';
  if (options.fixedEmails.includes(email)) return 'allowed';

  const now = Date.now();
  const cached = allowCache.get(email);
  if (cached && cached.expiresAt > now) {
    return judgeRow(cached.rowCreatedAt, options.sessionCreatedAt);
  }

  if (lastFailureAt !== null && now - lastFailureAt < FAILURE_MEMORY_MS) {
    throw new GateAllowlistUnavailableError('allowlist lookup recently failed');
  }

  let rowCreatedAt: Date | null;
  let startedAt: number;
  try {
    ({ rowCreatedAt, startedAt } = await lookupRowCreatedAt(email));
  } catch (error) {
    lastFailureAt = Date.now();
    if (error instanceof GateAllowlistUnavailableError) throw error;
    throw new GateAllowlistUnavailableError('allowlist lookup failed', {
      cause: error,
    });
  }
  lastFailureAt = null;

  if (rowCreatedAt === null) {
    allowCache.delete(email);
    return 'not_allowed';
  }
  pruneExpired(now);
  allowCache.set(email, {
    rowCreatedAt,
    expiresAt: startedAt + GATE_ALLOW_CACHE_TTL_SEC * 1000,
  });
  return judgeRow(rowCreatedAt, options.sessionCreatedAt);
}

/** テスト用: プロセス内の状態を捨てる */
export function resetGateAllowlistStateForTests(): void {
  allowCache.clear();
  inFlight.clear();
  lastFailureAt = null;
}
