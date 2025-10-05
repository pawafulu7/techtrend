'use client';

/**
 * Next.js Image Loader for TechTrend
 *
 * Purpose:
 * - Return external image URLs as-is without Next.js optimization
 * - Enable display of images from 800+ domains without whitelist management
 *
 * Background:
 * - TechTrend collects articles from 39 sources with diverse image hosts
 * - Managing remotePatterns (whitelist) for 800+ domains is impractical
 * - unoptimized approach avoids SSRF risks (browser fetches directly)
 *
 * Security:
 * - No SSRF risk: Next.js server doesn't fetch images
 * - CSP protection: img-src 'self' data: https: blob:
 * - X-Content-Type-Options: nosniff (already configured)
 *
 * Future Enhancement:
 * - Detect high-traffic domains for selective optimization
 * - Introduce image proxy for caching and optimization
 * - Migrate to hybrid approach (remotePatterns + proxy)
 *
 * @param {Object} params - Image loader parameters
 * @param {string} params.src - Source URL of the image
 * @param {number} params.width - Requested width (currently unused)
 * @param {number} params.quality - Requested quality (currently unused)
 * @returns {string} - The original source URL unchanged
 */
export default function imageLoader({ src, width: _width, quality: _quality }) {
  // Currently, we return the source URL as-is (no optimization)
  // width and quality parameters are ignored but kept for future enhancement
  return src;
}
