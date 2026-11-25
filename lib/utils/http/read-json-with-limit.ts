/**
 * リクエストの本文を、上限のバイト数までだけ読んで JSON として解釈する
 *
 * `request.json()` は本文を最後まで読むので、未ログインでも送れる API では大きな本文で
 * メモリを使わせられる。Content-Length は付かないこともある（チャンク転送）ので、
 * 宣言された値で先に断ったうえで、実際に読んだバイト数でも数えて打ち切る。
 */

export type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'invalid_json' };

export type ReadTextResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'too_large' | 'unreadable' };

/** 本文を上限のバイト数までだけ読み、UTF-8 の文字列として返す（JSON でない本文。フォームの送信など） */
export async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number
): Promise<ReadTextResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  if (!request.body) {
    return { ok: false, reason: 'unreadable' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  // 読み取りの途中で接続が切れたなどの失敗も、読めなかった扱いにする
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // 読むのをやめる。止められなくても上限は超えているので 413 にする
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

export async function readJsonWithLimit(
  request: Request,
  maxBytes: number
): Promise<ReadJsonResult> {
  const text = await readRequestTextWithLimit(request, maxBytes);
  if (!text.ok) {
    return {
      ok: false,
      reason: text.reason === 'too_large' ? 'too_large' : 'invalid_json',
    };
  }
  try {
    return { ok: true, value: JSON.parse(text.value) };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}
