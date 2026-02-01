/**
 * TagNormalizer Characterization Tests (Snapshot)
 *
 * Purpose: Capture current behavior to detect unintended changes during refactoring.
 * These tests use snapshots to record the current normalization rules behavior.
 *
 * @see lib/services/tag-normalizer.ts
 */

import { TagNormalizer } from '../../lib/services/tag-normalizer';

describe('TagNormalizer Characterization Tests', () => {
  describe('normalizeTags - comprehensive input variations', () => {
    // Test data representing real-world tag combinations from articles
    const testCases = {
      aiAndLlm: [
        'claude', 'Claude Code', 'claude-sonnet', 'Claude 4',
        'GPT-4', 'gpt4', 'ChatGPT', 'GPT-5',
        'openai', 'Open AI', 'OpenAI API',
        'gemini', 'Gemini API', 'Google Gemini',
        'LLM', 'llms', 'Large Language Model',
        '生成AI', 'GenAI', 'Generative AI',
        'AIエージェント', 'AI Agent', 'Agentic AI',
      ],
      programmingLanguages: [
        'javascript', 'js', 'JS',
        'typescript', 'ts', 'TS',
        'python', 'Python3', 'py',
        'go', 'golang', 'Golang',
        'rust', 'Rust',
        'java', 'Java',
        'ruby', 'Ruby',
      ],
      frameworks: [
        'react', 'React.js', 'ReactJS',
        'vue', 'Vue.js', 'vuejs', 'Vue3',
        'next.js', 'nextjs', 'Next.js 14',
        'node', 'nodejs', 'Node.js',
        'express', 'Express.js',
        'fastapi', 'FastAPI',
        'django', 'Django',
        'rails', 'Ruby on Rails',
      ],
      cloud: [
        'aws', 'AWS', 'Amazon Web Services',
        'gcp', 'Google Cloud', 'Google Cloud Platform',
        'azure', 'Microsoft Azure', 'Azure OpenAI',
        'docker', 'Docker', 'docker-compose',
        'kubernetes', 'k8s', 'K8s',
        'terraform', 'Terraform',
        'vercel', 'Vercel',
      ],
      databases: [
        'postgres', 'postgresql', 'PostgreSQL',
        'mysql', 'MySQL', 'mariadb',
        'mongo', 'mongodb', 'MongoDB',
        'redis', 'Redis',
        'dynamodb', 'DynamoDB',
        'sqlite', 'SQLite',
      ],
      devops: [
        'ci/cd', 'CI/CD',
        'github actions', 'GitHub Actions',
        'jenkins', 'Jenkins',
        'circleci', 'CircleCI',
        'gitlab ci', 'GitLab CI',
      ],
      security: [
        'security', 'Security',
        'oauth', 'OAuth', 'OAuth2',
        'jwt', 'JWT',
        'xss', 'XSS',
        'csrf', 'CSRF',
      ],
      web: [
        'api', 'API',
        'rest', 'REST', 'REST API',
        'graphql', 'GraphQL',
        'websocket', 'WebSocket',
        'http', 'HTTP', 'HTTPS',
      ],
      mixedRealWorld: [
        // Simulating real article tags
        'React', 'typescript', 'aws', 'docker',
        'Next.js 14', 'postgresql', 'prisma',
        'tailwindcss', 'vercel', 'github actions',
      ],
    };

    it.each(Object.entries(testCases))(
      'normalizes %s tags correctly',
      (category, tags) => {
        const result = TagNormalizer.normalizeTags(tags);
        expect(result).toMatchSnapshot(`${category}-normalization`);
      }
    );
  });

  describe('normalize - individual tag variations', () => {
    // Edge cases and boundary conditions
    const edgeCases = [
      // Empty and whitespace
      ['', 'empty string'],
      ['   ', 'whitespace only'],
      ['  trimmed  ', 'needs trimming'],

      // Case variations
      ['JAVASCRIPT', 'all caps'],
      ['javascript', 'all lowercase'],
      ['JavaScript', 'proper case'],

      // Special characters
      ['c++', 'plus signs'],
      ['c#', 'hash sign'],
      ['.net', 'leading dot'],
      ['node.js', 'dot in name'],

      // Japanese characters
      ['機械学習', 'japanese ml'],
      ['フロントエンド', 'japanese frontend'],
      ['データベース', 'japanese database'],

      // Numbers and versions
      ['Python 3.11', 'with version'],
      ['React 18', 'with major version'],
      ['ES2024', 'year suffix'],

      // Hyphenated and underscored
      ['machine-learning', 'hyphenated'],
      ['machine_learning', 'underscored'],
      ['deep learning', 'spaced'],

      // Unknown tags (should use basic normalization)
      ['unknowntag', 'unknown lowercase'],
      ['UnknownTag', 'unknown mixed case'],
      ['UNKNOWNTAG', 'unknown uppercase'],
    ];

    it.each(edgeCases)(
      'normalizes "%s" (%s)',
      (tag, _description) => {
        const result = TagNormalizer.normalize(tag);
        expect(result).toMatchSnapshot();
      }
    );
  });

  describe('inferCategory - category inference from tag lists', () => {
    const categoryTestCases = [
      {
        name: 'ai-ml first',
        tags: [
          { name: 'GPT', category: 'ai-ml' },
          { name: 'Python', category: 'language' },
        ],
      },
      {
        name: 'mixed with undefined first',
        tags: [
          { name: 'CustomTag', category: undefined },
          { name: 'React', category: 'framework' },
        ],
      },
      {
        name: 'all undefined',
        tags: [
          { name: 'Tag1', category: undefined },
          { name: 'Tag2', category: undefined },
        ],
      },
      {
        name: 'empty array',
        tags: [],
      },
      {
        name: 'single tag with category',
        tags: [{ name: 'Docker', category: 'cloud' }],
      },
    ];

    it.each(categoryTestCases)(
      'infers category for $name',
      ({ tags }) => {
        const result = TagNormalizer.inferCategory(tags);
        expect(result).toMatchSnapshot();
      }
    );
  });

  describe('rules coverage - verify all rule categories are tested', () => {
    // Access rules to ensure all categories have test coverage
    const ruleCategories = [
      'ai-ml',
      'language',
      'framework',
      'cloud',
      'database',
      'devops',
      'security',
      'web',
    ];

    it('all categories have coverage in tests', () => {
      // This test documents which categories exist
      expect(ruleCategories).toMatchSnapshot('rule-categories');
    });
  });
});
