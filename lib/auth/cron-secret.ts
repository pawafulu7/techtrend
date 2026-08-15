/**
 * cron 認証に使うシークレットの正規化・選択を 1 箇所に集約する。
 *
 * CRON_TOKEN は新名称、CRON_SECRET は旧名称であり「両方が同時に有効な独立した
 * 資格情報」ではない（リネーム移行のフォールバック）。CRON_TOKEN が設定されていれば
 * CRON_SECRET は参照しない。
 *
 * ## 検証の二層構造
 *
 * シークレットの妥当性は 2 つの層で扱う。役割が異なるため両方が必要になる。
 *
 * | 層 | 実装 | 役割 | 失敗時の挙動 |
 * |---|---|---|---|
 * | 起動時 | lib/config/env.ts の zod スキーマ | 設定ミスを大きく可視化する | 例外。production では env.ts のモジュールロード時に `getEnv()` が走るため**起動自体が失敗する** |
 * | 認証時 | このモジュール | 選択結果を fail-closed にする | undefined を返し、呼び出し元が 401 を返す |
 *
 * production では `proxy.ts` が csrf-protection.ts / auth-cookies.ts を経由して
 * env.ts を静的 import しているため、不正な CRON_* があれば起動時に落ちる。
 * したがって認証時の層に到達するのは実質的に開発・テスト環境に限られる。
 * それでもこの層を fail-closed にしておくのは、`proxy.ts` の `readGateEnv()` が
 * 生の `process.env` を読む（zod を経由しない）ためであり、多層防御として置いている。
 *
 * ここで throw しないのは、`readGateEnv()` から例外を投げると middleware レベルの
 * 未捕捉例外になり、`proxy.ts` の `gate.kind === 'misconfigured'` → 503 という
 * 制御された経路を迂回してしまうため。
 */

/**
 * cron シークレットとして受理する文字集合（可視 ASCII、U+0021-U+007E）。
 *
 * lib/config/env.ts の zod スキーマ（bearerSecret）と**この定数を共有する**。
 * 判定規則を 2 箇所に持つと、片方だけ変更されて「env は通すが認証は通らない」
 * 状態が再発するため。受理範囲の根拠は env.ts 側の docblock を参照。
 *
 * 注: lib/auth/authorization-header.ts のトークン抽出規則（`[^ \t]+` + 制御文字拒否）
 * とは一致しない。パーサーはワイヤから届いた値をどこまで受理するかの規則であり、
 * 非 ASCII も受理する。こちらは「設定してよい値」のポリシーであり、
 * HTTP ヘッダとして送出できない値を最初から弾くぶん厳しい。
 */
export const CRON_SECRET_PATTERN = /^[!-~]+$/;

/**
 * 空白のみは未設定として扱う。lib/config/env.ts の sanitizeEnv() と同じ規則。
 *
 * この正規化は API 側（sanitizeEnv 済みの env.*）とゲート側（生の process.env）で
 * 同じシークレットが選ばれることを保証するために必須である。片方だけが空白文字列を
 * truthy として選ぶと、API が受理するリクエストをゲートが 401 にする。
 *
 * トレードオフ: シークレット注入の失敗（テンプレート展開ミス等）で CRON_TOKEN が
 * 空白のみになった場合、警告なく CRON_SECRET へフォールバックするため
 * ローテーション失敗に気づけない。それでも sanitizeEnv と規則を揃えることを
 * 優先している。ここだけ規則を変えると上記の不整合が再発するため。
 */
function normalize(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() === '' ? undefined : value;
}

/**
 * CRON_TOKEN を優先し、未設定なら CRON_SECRET へフォールバックして選択する。
 *
 * 選択された値が Authorization ヘッダとして送出できない文字を含む場合は
 * undefined を返す（fail-closed）。**フォールバックはしない**:
 * CRON_TOKEN に不正な値が設定されている状態で旧 CRON_SECRET へ暗黙に
 * 戻ると、ローテーション失敗に気づけないため。
 *
 * 選択されなかった側の値は検証しない。未使用の値の不正で認証を止める必要はなく、
 * 起動時の zod スキーマが別途検出する（そちらは未使用側も検証するため、
 * 不正な値が残っていれば起動時に落ちる）。
 */
export function resolveCronSecret(
  token: string | undefined,
  legacy: string | undefined
): string | undefined {
  const selected = normalize(token) ?? normalize(legacy);
  if (selected === undefined) return undefined;
  return CRON_SECRET_PATTERN.test(selected) ? selected : undefined;
}
