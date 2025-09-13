/**
 * URL Validator Utility
 *
 * Provides secure URL validation and host checking functions
 * to prevent SSRF attacks and URL manipulation vulnerabilities.
 *
 * @module url-validator
 */

/**
 * List of allowed hosts for article sources
 *
 * These are the legitimate domains from which we fetch articles.
 * Add new domains here when integrating new sources.
 */
const ALLOWED_HOSTS = [
  // Tech News & Blogs
  'dev.to',
  'qiita.com',
  'zenn.dev',
  'medium.com',
  'stackoverflow.blog',
  'thinkit.co.jp',
  'publickey1.jp',
  'infoq.com',

  // Corporate Tech Blogs
  'tech.mercari.com',
  'techblog.yahoo.co.jp',
  'developers.freee.co.jp',
  'buildersbox.corp-sansan.com',
  'techblog.zozo.com',
  'tech.pepabo.com',
  'developer.hatenastaff.com',
  'engineering.mercari.com',
  'engineering.linecorp.com',
  'developers.cyberagent.co.jp',
  'tech.uzabase.com',
  'tech.gunosy.io',
  'techlife.cookpad.com',
  'tech.smarthr.jp',
  'tech.plaid.co.jp',
  'devblog.thebase.in',
  'techblog.lycorp.co.jp',
  'tech.ca-adv.co.jp',
  'note.com',

  // Cloud Providers
  'aws.amazon.com',
  'cloud.google.com',
  'azure.microsoft.com',
  'blog.cloudflare.com',

  // Developer Platforms
  'github.com',
  'github.blog',
  'gitlab.com',
  'bitbucket.org',

  // Programming Languages & Frameworks
  'blog.rust-lang.org',
  'blog.golang.org',
  'go.dev',
  'nodejs.org',
  'reactjs.org',
  'react.dev',
  'vuejs.org',
  'angular.io',
  'rubyonrails.org',
  'weblog.rubyonrails.org',
  'python.org',

  // AI & ML
  'openai.com',
  'huggingface.co',
  'ai.googleblog.com',
  'blog.google',
  'developers.googleblog.com',

  // Browser & Web Standards
  'hacks.mozilla.org',
  'developer.chrome.com',
  'webkit.org',

  // Documentation & Learning
  'developer.mozilla.org',
  'web.dev',
  'css-tricks.com',
  'smashingmagazine.com',

  // Forums & Communities
  'news.ycombinator.com',
  'reddit.com',
  'lobste.rs',
  'hashnode.com',

  // Presentation Platforms
  'speakerdeck.com',
  'slideshare.net',
  'docswell.com',

  // Package Repositories
  'npmjs.com',
  'pypi.org',
  'rubygems.org',
  'crates.io',
  'packagist.org',

  // Other Tech Sources
  'arxiv.org',
  'arstechnica.com',
  'theverge.com',
  'wired.com',
  'techcrunch.com',

  // Japanese Tech Media
  'atmarkit.co.jp',
  'codezine.jp',
  'gihyo.jp'
];

/**
 * Validate if a URL string is properly formatted
 *
 * @param url - URL string to validate
 * @returns True if URL is valid, false otherwise
 */
export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    // Ensure the URL has a valid protocol
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Check if a URL's host is in the allowed list
 *
 * This function properly parses the URL and checks only the hostname,
 * preventing bypass attacks where the allowed domain appears in the path
 * or query parameters.
 *
 * @param url - URL string to check
 * @returns True if host is allowed, false otherwise
 */
export function isAllowedHost(url: string): boolean {
  if (!validateUrl(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check exact match
    if (ALLOWED_HOSTS.includes(hostname)) {
      return true;
    }

    // Check for subdomains (e.g., blog.example.com matches example.com)
    return ALLOWED_HOSTS.some(allowedHost => {
      // Exact match
      if (hostname === allowedHost) {
        return true;
      }
      // Subdomain match (hostname ends with .allowedHost)
      return hostname.endsWith('.' + allowedHost);
    });
  } catch {
    return false;
  }
}

/**
 * Parse and validate a URL
 *
 * Combines URL parsing and validation in a single function.
 * Returns the parsed URL object if valid, null otherwise.
 *
 * @param url - URL string to parse and validate
 * @returns Parsed URL object or null
 */
export function parseAndValidateUrl(url: string): URL | null {
  if (!validateUrl(url)) {
    return null;
  }

  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Check if a URL belongs to a specific domain
 *
 * Safely checks if a URL belongs to a specific domain,
 * preventing bypass attacks.
 *
 * @param url - URL string to check
 * @param domain - Domain to check against
 * @returns True if URL belongs to domain, false otherwise
 */
export function isUrlFromDomain(url: string, domain: string): boolean {
  const parsed = parseAndValidateUrl(url);
  if (!parsed) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const checkDomain = domain.toLowerCase();

  // Exact match
  if (hostname === checkDomain) {
    return true;
  }

  // Subdomain match
  return hostname.endsWith('.' + checkDomain);
}

/**
 * Get the domain from a URL
 *
 * Safely extracts the domain from a URL string.
 *
 * @param url - URL string
 * @returns Domain string or null if invalid
 */
export function getDomainFromUrl(url: string): string | null {
  const parsed = parseAndValidateUrl(url);
  if (!parsed) {
    return null;
  }

  return parsed.hostname;
}

/**
 * Check if URL is from a tech blog or news source
 *
 * Specialized check for tech-related content sources.
 *
 * @param url - URL to check
 * @returns True if from a known tech source
 */
export function isTechSource(url: string): boolean {
  return isAllowedHost(url);
}

/**
 * Add a new allowed host
 *
 * Dynamically add a new host to the allowed list.
 * Use with caution and proper validation.
 *
 * @param host - Host to add
 */
export function addAllowedHost(host: string): void {
  if (!host || typeof host !== 'string') {
    throw new Error('Invalid host');
  }

  const normalized = host.toLowerCase().trim();
  if (!ALLOWED_HOSTS.includes(normalized)) {
    ALLOWED_HOSTS.push(normalized);
  }
}

/**
 * Get the list of allowed hosts
 *
 * Returns a copy of the allowed hosts list.
 *
 * @returns Array of allowed hosts
 */
export function getAllowedHosts(): string[] {
  return [...ALLOWED_HOSTS];
}