/**
 * Readability Worker Thread (JavaScript)
 *
 * jsdom/Readability processing isolated in a separate thread to prevent
 * blocking the main event loop. This ensures timeouts work correctly
 * even when jsdom performs heavy synchronous DOM parsing.
 *
 * Usage: Spawned by extractWithReadability() in readability.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { parentPort, workerData } = require('worker_threads');

async function processHtml() {
  const { html, url } = workerData;

  try {
    // Dynamic import for ESM-only jsdom
    const { JSDOM, VirtualConsole } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');

    const virtualConsole = new VirtualConsole();

    // Suppress CSS warnings and other non-critical errors
    virtualConsole.on('error', () => {
      // Intentionally suppress console.error from scripts
    });
    virtualConsole.on('jsdomError', () => {
      // Intentionally suppress jsdom internal errors (CSS parsing, etc.)
    });

    const dom = new JSDOM(html, { url, virtualConsole });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article?.textContent) {
      return {
        success: true,
        content: article.textContent,
        thumbnail: undefined,
        title: article.title || undefined,
      };
    }

    return {
      success: true,
      content: null,
      thumbnail: undefined,
      title: undefined,
    };
  } catch (error) {
    return {
      success: false,
      content: null,
      thumbnail: undefined,
      title: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Execute and send result back to parent
processHtml()
  .then((result) => {
    parentPort?.postMessage(result);
  })
  .catch((error) => {
    parentPort?.postMessage({
      success: false,
      content: null,
      thumbnail: undefined,
      title: undefined,
      error: error instanceof Error ? error.message : String(error),
    });
  });
