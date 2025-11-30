/**
 * Personalization Constants
 *
 * Category definitions and tag mappings for article personalization.
 */

import type { InterestCategoryDefinition, InterestCategorySlug } from './types';

// =============================================================================
// Interest Category Definitions
// =============================================================================

/**
 * Interest category definitions with tag patterns
 *
 * Each category includes:
 * - slug: Unique identifier
 * - name: Display name (Japanese)
 * - description: Short description
 * - icon: Lucide icon name
 * - sortOrder: Display order
 * - tagPatterns: Tag name patterns for mapping (case-insensitive)
 */
export const INTEREST_CATEGORIES: InterestCategoryDefinition[] = [
  {
    slug: 'frontend',
    name: 'Frontend',
    description: 'Web UI/UX development',
    icon: 'Monitor',
    sortOrder: 1,
    tagPatterns: [
      'React',
      'Vue',
      'Vue.js',
      'Next.js',
      'Nuxt',
      'Nuxt.js',
      'TypeScript',
      'JavaScript',
      'CSS',
      'HTML',
      'Tailwind',
      'Tailwind CSS',
      'SCSS',
      'Sass',
      'Webpack',
      'Vite',
      'UI',
      'UX',
      'Svelte',
      'Angular',
      'Remix',
      'Astro',
      'SolidJS',
      'Web Components',
    ],
  },
  {
    slug: 'backend',
    name: 'Backend / API',
    description: 'Server-side development',
    icon: 'Server',
    sortOrder: 2,
    tagPatterns: [
      'Python',
      'Go',
      'Golang',
      'Rust',
      'Java',
      'Ruby',
      'PHP',
      'Node.js',
      'API',
      'REST',
      'GraphQL',
      'gRPC',
      'Ruby on Rails',
      'Rails',
      'Django',
      'FastAPI',
      'Flask',
      'Express',
      'NestJS',
      'Spring',
      'Spring Boot',
      '.NET',
      'C#',
      'Kotlin',
      'Scala',
    ],
  },
  {
    slug: 'cloud',
    name: 'Cloud / Infrastructure',
    description: 'Cloud services and containers',
    icon: 'Cloud',
    sortOrder: 3,
    tagPatterns: [
      'AWS',
      'EC2',
      'S3',
      'Lambda',
      'CloudWatch',
      'VPC',
      'ECS',
      'EKS',
      'RDS',
      'DynamoDB',
      'CloudFormation',
      'CDK',
      'Azure',
      'GCP',
      'Google Cloud',
      'Kubernetes',
      'Docker',
      'Terraform',
      'Pulumi',
      'Cloudflare',
      'Vercel',
      'Netlify',
      'Heroku',
      'DigitalOcean',
    ],
  },
  {
    slug: 'database',
    name: 'Database',
    description: 'Data storage and SQL',
    icon: 'Database',
    sortOrder: 4,
    tagPatterns: [
      'PostgreSQL',
      'MySQL',
      'MariaDB',
      'SQL',
      'SQLite',
      'MongoDB',
      'Redis',
      'Elasticsearch',
      'DynamoDB',
      'Cassandra',
      'Neo4j',
      'Prisma',
      'TypeORM',
      'Drizzle',
      'ORM',
      'Database',
    ],
  },
  {
    slug: 'ai-ml',
    name: 'AI / Machine Learning',
    description: 'Artificial intelligence and LLMs',
    icon: 'Brain',
    sortOrder: 5,
    tagPatterns: [
      'AI',
      'LLM',
      'ChatGPT',
      'GPT',
      'Claude',
      'OpenAI',
      'Gemini',
      'Anthropic',
      'RAG',
      'NLP',
      'Transformer',
      'Deep Learning',
      'Machine Learning',
      'ML',
      'TensorFlow',
      'PyTorch',
      'Hugging Face',
      'LangChain',
      'Vector',
      'Embedding',
      'Stable Diffusion',
      'DALL-E',
      'Midjourney',
      'Copilot',
    ],
  },
  {
    slug: 'security',
    name: 'Security',
    description: 'Security and authentication',
    icon: 'Shield',
    sortOrder: 6,
    tagPatterns: [
      'Security',
      'Cybersecurity',
      'IAM',
      'OAuth',
      'OIDC',
      'JWT',
      'Authentication',
      'Authorization',
      'SAML',
      'SSO',
      'Zero Trust',
      'Encryption',
      'TLS',
      'SSL',
      'Vulnerability',
      'Penetration Testing',
      'SAST',
      'DAST',
      'WAF',
    ],
  },
  {
    slug: 'devops',
    name: 'DevOps / SRE',
    description: 'Operations, monitoring, CI/CD',
    icon: 'GitBranch',
    sortOrder: 7,
    tagPatterns: [
      'DevOps',
      'SRE',
      'CI/CD',
      'GitHub Actions',
      'GitLab CI',
      'Jenkins',
      'CircleCI',
      'ArgoCD',
      'Flux',
      'Observability',
      'Monitoring',
      'Grafana',
      'Prometheus',
      'Datadog',
      'New Relic',
      'OpenTelemetry',
      'Logging',
      'APM',
      'IaC',
      'Ansible',
      'Chef',
      'Puppet',
    ],
  },
];

// =============================================================================
// Generic Tag Stop List
// =============================================================================

/**
 * Generic tags to exclude from category matching
 *
 * These tags are too broad to provide meaningful category signals.
 */
export const GENERIC_TAG_STOP_LIST: string[] = [
  'Technology',
  'Tech',
  'Tech News',
  'News',
  'Development',
  'Software',
  'Programming',
  'Code',
  'Coding',
  'Engineering',
  'IT',
  'Computer',
  'Tutorial',
  'Guide',
  'Tips',
  'Best Practices',
  'Update',
  'Release',
  'Announcement',
];

// =============================================================================
// Period Presets
// =============================================================================

/**
 * Available period presets for filtering (in months)
 */
export const PERIOD_PRESETS = [
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '1Y' },
  { value: 0, label: 'All' },
] as const;

/**
 * Default period in months
 */
export const DEFAULT_PERIOD_MONTHS = 12;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get category definition by slug
 */
export function getCategoryBySlug(
  slug: InterestCategorySlug
): InterestCategoryDefinition | undefined {
  return INTEREST_CATEGORIES.find((c) => c.slug === slug);
}

/**
 * Get all category slugs
 */
export function getAllCategorySlugs(): InterestCategorySlug[] {
  return INTEREST_CATEGORIES.map((c) => c.slug);
}

/**
 * Check if a tag name is in the generic stop list (case-insensitive)
 */
export function isGenericTag(tagName: string): boolean {
  const lowerTagName = tagName.toLowerCase();
  return GENERIC_TAG_STOP_LIST.some(
    (stopTag) => stopTag.toLowerCase() === lowerTagName
  );
}

/**
 * Find matching categories for a tag name (case-insensitive)
 */
export function findCategoriesForTag(
  tagName: string
): InterestCategorySlug[] {
  const lowerTagName = tagName.toLowerCase();
  return INTEREST_CATEGORIES.filter((category) =>
    category.tagPatterns.some(
      (pattern) => pattern.toLowerCase() === lowerTagName
    )
  ).map((c) => c.slug);
}
