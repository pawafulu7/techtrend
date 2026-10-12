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

export async function readJsonWithLimit(
  request: Request,
  maxBytes: number
): Promise<ReadJsonResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  if (!request.body) {
    return { ok: false, reason: 'invalid_json' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: 'too_large' };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}
