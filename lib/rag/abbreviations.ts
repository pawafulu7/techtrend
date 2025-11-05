/**
 * Tech Abbreviation Dictionary
 *
 * Curated list of common technical abbreviations and their expansions.
 * Used for query expansion before embedding generation.
 *
 * Purpose:
 * - Improve semantic matching for abbreviations (e.g., "CTO" -> "Chief Technology Officer")
 * - Provide richer context for embedding generation
 * - Fast, deterministic expansion (< 5ms)
 *
 * Maintenance:
 * - Add new abbreviations as needed based on search logs
 * - Keep expansions concise and accurate
 * - Avoid overly specific or domain-specific terms
 *
 * @see .claude/docs/plan/plan_20251105_002920_989_ai-search-query-expansion.md
 */

/**
 * Raw abbreviation dictionary with human-friendly casing
 * Normalized to uppercase on export for consistent lookups
 */
const RAW_TECH_ABBREVIATIONS: Record<string, string> = {
  // Leadership & Roles
  'CTO': 'Chief Technology Officer',
  'CEO': 'Chief Executive Officer',
  'CIO': 'Chief Information Officer',
  'CDO': 'Chief Data Officer',
  'CPO': 'Chief Product Officer',
  'VP': 'Vice President',
  'PM': 'Product Manager',
  'EM': 'Engineering Manager',

  // Engineering Practices
  'SRE': 'Site Reliability Engineering',
  'DevOps': 'Development and Operations',
  'CI/CD': 'Continuous Integration Continuous Deployment',
  'CI': 'Continuous Integration',
  'CD': 'Continuous Deployment',
  'DDD': 'Domain-Driven Design',
  'TDD': 'Test-Driven Development',
  'BDD': 'Behavior-Driven Development',
  'SOLID': 'Single Responsibility Open Closed Liskov Substitution Interface Segregation Dependency Inversion',

  // Technologies & Frameworks
  'API': 'Application Programming Interface',
  'REST': 'Representational State Transfer',
  'GraphQL': 'Graph Query Language',
  'SQL': 'Structured Query Language',
  'NoSQL': 'Not Only SQL',
  'ORM': 'Object-Relational Mapping',
  'JSON': 'JavaScript Object Notation',
  'XML': 'Extensible Markup Language',
  'YAML': 'YAML Ain\'t Markup Language',
  'HTML': 'HyperText Markup Language',
  'CSS': 'Cascading Style Sheets',
  'JS': 'JavaScript',
  'TS': 'TypeScript',

  // Architecture & Patterns
  'SPA': 'Single Page Application',
  'SSR': 'Server-Side Rendering',
  'CSR': 'Client-Side Rendering',
  'SSG': 'Static Site Generation',
  'ISR': 'Incremental Static Regeneration',
  'MVC': 'Model View Controller',
  'MVVM': 'Model View ViewModel',
  'MVP': 'Model View Presenter',
  'SOA': 'Service-Oriented Architecture',
  'MSA': 'Microservices Architecture',

  // Cloud & Infrastructure
  'AWS': 'Amazon Web Services',
  'GCP': 'Google Cloud Platform',
  'Azure': 'Microsoft Azure',
  'K8s': 'Kubernetes',
  'VM': 'Virtual Machine',
  'CDN': 'Content Delivery Network',
  'DNS': 'Domain Name System',
  'VPN': 'Virtual Private Network',
  'SSL': 'Secure Sockets Layer',
  'TLS': 'Transport Layer Security',

  // Security & Standards
  'XSS': 'Cross-Site Scripting',
  'CSRF': 'Cross-Site Request Forgery',
  'JWT': 'JSON Web Token',
  'OAuth': 'Open Authorization',
  'HTTPS': 'Hypertext Transfer Protocol Secure',
  'CORS': 'Cross-Origin Resource Sharing',
  'CSP': 'Content Security Policy',
  'GDPR': 'General Data Protection Regulation',

  // Data & AI/ML
  'AI': 'Artificial Intelligence',
  'ML': 'Machine Learning',
  'DL': 'Deep Learning',
  'NLP': 'Natural Language Processing',
  'LLM': 'Large Language Model',
  'RAG': 'Retrieval-Augmented Generation',
  'ETL': 'Extract Transform Load',
  'OLAP': 'Online Analytical Processing',
  'OLTP': 'Online Transaction Processing',

  // Development Tools
  'IDE': 'Integrated Development Environment',
  'CLI': 'Command-Line Interface',
  'GUI': 'Graphical User Interface',
  'SDK': 'Software Development Kit',
  'VCS': 'Version Control System',
  'Git': 'Git Version Control',
  'npm': 'Node Package Manager',
  'UI': 'User Interface',
  'UX': 'User Experience',

  // Performance & Optimization
  'LCP': 'Largest Contentful Paint',
  'FID': 'First Input Delay',
  'CLS': 'Cumulative Layout Shift',
  'TTI': 'Time to Interactive',
  'TTFB': 'Time to First Byte',
};

/**
 * Normalized abbreviation dictionary (all keys uppercase)
 *
 * Ensures consistent lookups regardless of input casing.
 * Generated from RAW_TECH_ABBREVIATIONS at module load time.
 */
export const TECH_ABBREVIATIONS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_TECH_ABBREVIATIONS).map(([k, v]) => [k.toUpperCase(), v])
);

/**
 * Expand query using static dictionary
 *
 * Strategy:
 * 1. Try direct match (entire query is an abbreviation)
 * 2. Try token match (expand individual tokens if recognized)
 * 3. Return original if no match found
 *
 * @param query - Original query text
 * @returns Expanded query if abbreviation found, original otherwise
 *
 * @example
 * expandQueryWithDictionary("CTO")           // "Chief Technology Officer"
 * expandQueryWithDictionary("CTO role")      // "Chief Technology Officer role"
 * expandQueryWithDictionary("React")         // "React" (no expansion)
 * expandQueryWithDictionary("SRE practices") // "Site Reliability Engineering practices"
 */
export function expandQueryWithDictionary(query: string): string {
  const trimmed = query.trim();

  if (!trimmed) {
    return trimmed;
  }

  const upperQuery = trimmed.toUpperCase();

  // Strategy 1: Direct match (entire query is an abbreviation)
  if (TECH_ABBREVIATIONS[upperQuery]) {
    return TECH_ABBREVIATIONS[upperQuery];
  }

  // Strategy 2: Token match (expand individual tokens)
  const tokens = trimmed.split(/\s+/);

  // Only expand if query is short (≤5 tokens) to avoid over-expansion
  if (tokens.length > 1 && tokens.length <= 5) {
    const expandedTokens = tokens.map(token => {
      // Preserve original case for non-abbreviations
      const upper = token.toUpperCase();
      return TECH_ABBREVIATIONS[upper] || token;
    });

    // Only use expansion if at least one token was expanded
    const hasExpansion = expandedTokens.some((t, i) => t !== tokens[i]);
    if (hasExpansion) {
      return expandedTokens.join(' ');
    }
  }

  // Strategy 3: No match found
  return trimmed;
}
