/**
 * URL Validator Utility
 *
 * Provides secure URL validation functions to prevent SSRF and open redirect vulnerabilities.
 * Uses URL API for robust domain validation instead of string matching.
 *
 * @module url-validator
 */

/**
 * Check if a URL belongs to a specific domain
 *
 * Validates that a URL's hostname matches the expected domain.
 * Prevents vulnerabilities where attackers use path-based domain spoofing.
 *
 * @param urlString - The URL to validate
 * @param expectedDomain - The expected domain (e.g., 'github.com')
 * @returns True if the URL belongs to the expected domain
 */
export function isUrlFromDomain(urlString: string, expectedDomain: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    const expected = expectedDomain.toLowerCase();

    // Check for exact match or with www prefix or as subdomain
    return hostname === expected ||
           hostname === `www.${expected}` ||
           hostname.endsWith(`.${expected}`);
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Extract domain from URL
 *
 * Safely extracts the domain name from a URL string.
 * Returns null for invalid URLs.
 *
 * @param urlString - The URL to parse
 * @returns The domain name without www prefix, or null if invalid
 */
export function getDomainFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase().replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Check if URL uses HTTPS
 *
 * Validates that a URL uses the secure HTTPS protocol.
 *
 * @param urlString - The URL to check
 * @returns True if the URL uses HTTPS
 */
export function isHttpsUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate URL format
 *
 * Checks if a string is a valid URL format.
 *
 * @param urlString - The string to validate
 * @returns True if the string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get URL without query parameters
 *
 * Returns the URL without query string parameters.
 *
 * @param urlString - The URL to clean
 * @returns The URL without query parameters, or null if invalid
 */
export function getUrlWithoutParams(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return null;
  }
}