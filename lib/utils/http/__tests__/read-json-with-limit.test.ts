import { readJsonWithLimit } from '../read-json-with-limit';

/** Content-Length を付けずに、本文をチャンクに分けて流す要求を作る */
function streamingRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body,
    // Node の fetch 実装はストリームの本文に duplex を要求する
    duplex: 'half',
  } as RequestInit);
}

describe('readJsonWithLimit', () => {
  it('上限以内の JSON を読む', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ message: 'こんにちは' }),
    });

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: true,
      value: { message: 'こんにちは' },
    });
  });

  it('ちょうど上限のバイト数は読む', async () => {
    const json = JSON.stringify({ m: 'x'.repeat(100) });
    const bytes = new TextEncoder().encode(json).byteLength;

    const result = await readJsonWithLimit(streamingRequest([json]), bytes);

    expect(result).toEqual({ ok: true, value: { m: 'x'.repeat(100) } });
  });

  it('Content-Length が上限を超えていれば読む前に断る', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': '999999' },
    });

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('Content-Length が無くても、読んだバイト数が上限を超えたら打ち切る', async () => {
    const chunks = ['{"m":"', 'x'.repeat(600), 'x'.repeat(600), '"}'];
    const request = streamingRequest(chunks);
    expect(request.headers.get('content-length')).toBeNull();

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('マルチバイト文字はバイト数で数える', async () => {
    // 「あ」は UTF-8 で 3 バイト。400 文字で 1200 バイト
    const request = streamingRequest([`{"m":"${'あ'.repeat(400)}"}`]);

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('JSON として読めなければ invalid_json', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: '{"message":',
    });

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('読み取りの途中で失敗したら invalid_json（例外を外へ出さない）', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('上限を超えた後に読むのを止められなくても too_large', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('x'.repeat(2048)));
      },
      cancel() {
        throw new Error('cancel failed');
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('本文が無ければ invalid_json', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
    });

    await expect(readJsonWithLimit(request, 1024)).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });
});
