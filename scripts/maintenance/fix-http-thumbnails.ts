/**
 * HTTP Thumbnail URLs to HTTPS Converter
 *
 * Purpose:
 * - Convert HTTP thumbnail URLs to HTTPS where possible
 * - Set to NULL for private IPs, localhost, and unreachable URLs
 *
 * Background:
 * - 24 HTTP thumbnail URLs found in database
 * - CSP policy (img-src https:) blocks HTTP images
 * - Mixed content warnings for HTTP images on HTTPS pages
 *
 * Strategy:
 * 1. Extract all HTTP thumbnail URLs
 * 2. Skip private IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) and localhost
 * 3. Test HTTPS conversion for public domains
 * 4. Update successful conversions to HTTPS
 * 5. Set failed conversions to NULL
 */

import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

interface ThumbnailRecord {
  id: string;
  title: string;
  thumbnail: string;
}

/**
 * Check if URL is private IP or localhost
 */
function isPrivateOrLocalhost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;

    // Localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // Private IP ranges
    const privateRanges = [
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
    ];

    return privateRanges.some(range => range.test(hostname));
  } catch {
    // Invalid URLs treated as private for safety
    return true;
  }
}

/**
 * Test if HTTPS version is reachable
 * - First tries HEAD request (lightweight)
 * - Falls back to GET if HEAD returns 405/501 (method not allowed)
 * - Ensures timeout is always cleared
 */
async function testHttpsUrl(httpUrl: string): Promise<boolean> {
  const httpsUrl = httpUrl.replace(/^http:/, 'https:');

  const probe = async (
    method: 'HEAD' | 'GET',
  ): Promise<{ ok: boolean; status?: number }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(httpsUrl, {
        method,
        signal: controller.signal,
        redirect: 'follow',
      });

      // Cancel GET response body to avoid memory leak
      if (method === 'GET' && response.body) {
        await response.body.cancel();
      }

      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Try HEAD first (lightweight)
  const headResult = await probe('HEAD');
  if (headResult.ok) {
    return true;
  }

  // Fallback to GET if HEAD is not allowed (405/501)
  if (headResult.status === 405 || headResult.status === 501) {
    const getResult = await probe('GET');
    return getResult.ok;
  }

  return false;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting HTTP thumbnail URL conversion...\n');

  // Fetch all HTTP thumbnails
  const httpThumbnails = await prisma.article.findMany({
    where: {
      thumbnail: {
        startsWith: 'http://',
      },
    },
    select: {
      id: true,
      title: true,
      thumbnail: true,
    },
  });

  console.log(`Found ${httpThumbnails.length} HTTP thumbnail URLs\n`);

  let privateCount = 0;
  let httpsSuccessCount = 0;
  let httpsFailCount = 0;

  for (const article of httpThumbnails) {
    const httpUrl = article.thumbnail!;

    // Skip private IPs and localhost
    if (isPrivateOrLocalhost(httpUrl)) {
      console.log(`[PRIVATE] ${article.id}: ${httpUrl}`);
      console.log(`  Action: Set to NULL\n`);

      await prisma.article.update({
        where: { id: article.id },
        data: { thumbnail: null },
      });

      privateCount++;
      continue;
    }

    // Test HTTPS conversion
    const httpsUrl = httpUrl.replace(/^http:/, 'https:');
    console.log(`[TESTING] ${article.id}: ${httpUrl}`);
    console.log(`  Trying: ${httpsUrl}`);

    const isReachable = await testHttpsUrl(httpUrl);

    if (isReachable) {
      console.log(`  Result: SUCCESS - Converting to HTTPS\n`);

      await prisma.article.update({
        where: { id: article.id },
        data: { thumbnail: httpsUrl },
      });

      httpsSuccessCount++;
    } else {
      console.log(`  Result: FAILED - Setting to NULL\n`);

      await prisma.article.update({
        where: { id: article.id },
        data: { thumbnail: null },
      });

      httpsFailCount++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total HTTP thumbnails: ${httpThumbnails.length}`);
  console.log(`Private/Localhost (set to NULL): ${privateCount}`);
  console.log(`HTTPS conversion success: ${httpsSuccessCount}`);
  console.log(`HTTPS conversion failed (set to NULL): ${httpsFailCount}`);
  console.log('\nConversion completed successfully!');
}

main()
  .catch((error) => {
    console.error('Error during conversion:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
