// Early polyfills executed before the test framework
try {
  // Prefer undici's web implementations if available
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const undici = require('undici');
  if (undici?.File && !global.File) {
    // @ts-ignore
    global.File = undici.File;
  }
  if (undici?.Blob && !global.Blob) {
    // @ts-ignore
    global.Blob = undici.Blob;
  }
} catch (_) {
  // ignore
}

