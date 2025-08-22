/**
 * タグ正規化サービス
 * 表記揺れを統一し、適切な粒度のタグに変換
 */

interface NormalizationRule {
  patterns: RegExp[];
  canonical: string;
  category?: string;
}

export class TagNormalizer {
  private static rules: NormalizationRule[] = [
    // AI/LLM関連
    {
      patterns: [
        /^claude[\s-]?(code|sonnet)?$/i,
        /^claudecode$/i,
        /^claude[\s-]?(\d+|4)[\s-]?(sonnet)?$/i
      ],
      canonical: 'Claude',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^gpt[\s-]?[45]$/i,
        /^gpt[\s-]?4\.?\d?$/i,
        /^gpt[\s-]?5[\s-]?(thinking|pro|nano)?$/i,
        /^chatgpt[\s-]?[45]?$/i,
        /^chat[\s-]?gpt$/i
      ],
      canonical: 'GPT',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^openai$/i,
        /^open[\s-]?ai$/i,
        /^openai[\s-]?(api|gpt)?$/i
      ],
      canonical: 'OpenAI',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^gemini(\s+(api|pro|nano|cli))?$/i,
        /^google\s+gemini(\s+api)?$/i,
        /^gemini\s+\d+(\.\d+)?(\s+pro)?$/i
      ],
      canonical: 'Gemini',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^llm$/i,
        /^llms$/i,
        /^large[\s-]?language[\s-]?model/i
      ],
      canonical: 'LLM',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^(生成ai|genai|generative\s+ai|ジェネレーティブai)$/i,
        /^ai[\s-]?(生成|画像生成|動画生成)?$/i,
        /^画像生成ai$/i,
        /^動画生成$/i
      ],
      canonical: 'AI',
      category: 'ai-ml'
    },
    {
      patterns: [
        /^(aiエージェント|ai\s+agent|agentic\s+ai)$/i
      ],
      canonical: 'AIエージェント',
      category: 'ai-ml'
    },
    
    // プログラミング言語
    {
      patterns: [/^javascript$/i, /^js$/i],
      canonical: 'JavaScript',
      category: 'language'
    },
    {
      patterns: [/^typescript$/i, /^ts$/i],
      canonical: 'TypeScript',
      category: 'language'
    },
    {
      patterns: [/^python[\s]?[23]?$/i, /^py$/i],
      canonical: 'Python',
      category: 'language'
    },
    {
      patterns: [/^go(lang)?$/i],
      canonical: 'Go',
      category: 'language'
    },
    {
      patterns: [/^rust$/i],
      canonical: 'Rust',
      category: 'language'
    },
    {
      patterns: [/^java$/i],
      canonical: 'Java',
      category: 'language'
    },
    {
      patterns: [/^c\+\+$/i, /^cpp$/i],
      canonical: 'C++',
      category: 'language'
    },
    {
      patterns: [/^c#$/i, /^csharp$/i],
      canonical: 'C#',
      category: 'language'
    },
    {
      patterns: [/^ruby$/i, /^rb$/i],
      canonical: 'Ruby',
      category: 'language'
    },
    {
      patterns: [/^php$/i],
      canonical: 'PHP',
      category: 'language'
    },
    {
      patterns: [/^swift$/i],
      canonical: 'Swift',
      category: 'language'
    },
    {
      patterns: [/^kotlin$/i],
      canonical: 'Kotlin',
      category: 'language'
    },
    
    // フレームワーク・ライブラリ
    {
      patterns: [
        /^react(\.?js)?$/i,
        /^reactjs$/i
      ],
      canonical: 'React',
      category: 'framework'
    },
    {
      patterns: [
        /^vue(\.?js)?[\s]?[23]?$/i,
        /^vuejs$/i
      ],
      canonical: 'Vue.js',
      category: 'framework'
    },
    {
      patterns: [
        /^angular(js)?[\s]?\d*$/i
      ],
      canonical: 'Angular',
      category: 'framework'
    },
    {
      patterns: [
        /^node(\.?js)?$/i,
        /^nodejs$/i
      ],
      canonical: 'Node.js',
      category: 'framework'
    },
    {
      patterns: [
        /^next(\.?js)?[\s]?\d*$/i,
        /^nextjs$/i
      ],
      canonical: 'Next.js',
      category: 'framework'
    },
    {
      patterns: [
        /^nuxt(\.?js)?[\s]?\d*$/i,
        /^nuxtjs$/i
      ],
      canonical: 'Nuxt.js',
      category: 'framework'
    },
    {
      patterns: [
        /^express(\.?js)?$/i,
        /^expressjs$/i
      ],
      canonical: 'Express',
      category: 'framework'
    },
    {
      patterns: [
        /^django$/i
      ],
      canonical: 'Django',
      category: 'framework'
    },
    {
      patterns: [
        /^flask$/i
      ],
      canonical: 'Flask',
      category: 'framework'
    },
    {
      patterns: [
        /^(rails|ruby\s+on\s+rails)$/i,
        /^ror$/i
      ],
      canonical: 'Ruby on Rails',
      category: 'framework'
    },
    {
      patterns: [
        /^spring(\s+boot)?$/i
      ],
      canonical: 'Spring',
      category: 'framework'
    },
    {
      patterns: [
        /^\.?net(\s+core)?$/i,
        /^dotnet$/i
      ],
      canonical: '.NET',
      category: 'framework'
    },
    {
      patterns: [
        /^tailwind(\s+css)?$/i,
        /^tailwindcss$/i
      ],
      canonical: 'Tailwind CSS',
      category: 'framework'
    },
    
    // クラウド・インフラ
    {
      patterns: [
        /^aws$/i,
        /^amazon\s+web\s+services$/i
      ],
      canonical: 'AWS',
      category: 'cloud'
    },
    {
      patterns: [
        /^gcp$/i,
        /^google\s+cloud(\s+platform)?$/i
      ],
      canonical: 'GCP',
      category: 'cloud'
    },
    {
      patterns: [
        /^azure$/i,
        /^microsoft\s+azure$/i,
        /^azure\s+(openai|ai)$/i
      ],
      canonical: 'Azure',
      category: 'cloud'
    },
    {
      patterns: [
        /^docker$/i,
        /^docker[\s-]?compose$/i
      ],
      canonical: 'Docker',
      category: 'cloud'
    },
    {
      patterns: [
        /^kubernetes$/i,
        /^k8s$/i
      ],
      canonical: 'Kubernetes',
      category: 'cloud'
    },
    {
      patterns: [
        /^terraform$/i
      ],
      canonical: 'Terraform',
      category: 'cloud'
    },
    {
      patterns: [
        /^github(\s+actions)?$/i
      ],
      canonical: 'GitHub',
      category: 'cloud'
    },
    {
      patterns: [
        /^gitlab(\s+ci)?$/i
      ],
      canonical: 'GitLab',
      category: 'cloud'
    },
    {
      patterns: [
        /^vercel$/i
      ],
      canonical: 'Vercel',
      category: 'cloud'
    },
    {
      patterns: [
        /^netlify$/i
      ],
      canonical: 'Netlify',
      category: 'cloud'
    },
    
    // データベース
    {
      patterns: [
        /^postgres(ql)?$/i,
        /^postgresql$/i
      ],
      canonical: 'PostgreSQL',
      category: 'database'
    },
    {
      patterns: [
        /^mysql$/i,
        /^mariadb$/i
      ],
      canonical: 'MySQL',
      category: 'database'
    },
    {
      patterns: [
        /^mongo(db)?$/i
      ],
      canonical: 'MongoDB',
      category: 'database'
    },
    {
      patterns: [
        /^redis$/i
      ],
      canonical: 'Redis',
      category: 'database'
    },
    {
      patterns: [
        /^sqlite$/i
      ],
      canonical: 'SQLite',
      category: 'database'
    },
    {
      patterns: [
        /^elastic(search)?$/i
      ],
      canonical: 'Elasticsearch',
      category: 'database'
    },
    {
      patterns: [
        /^firebase$/i,
        /^firestore$/i
      ],
      canonical: 'Firebase',
      category: 'database'
    },
    {
      patterns: [
        /^supabase$/i
      ],
      canonical: 'Supabase',
      category: 'database'
    },
    {
      patterns: [
        /^prisma$/i
      ],
      canonical: 'Prisma',
      category: 'database'
    },
    
    // ツール・開発環境
    {
      patterns: [
        /^vscode$/i,
        /^visual\s+studio\s+code$/i
      ],
      canonical: 'VS Code',
      category: 'tools'
    },
    {
      patterns: [
        /^git$/i
      ],
      canonical: 'Git',
      category: 'tools'
    },
    {
      patterns: [
        /^webpack$/i
      ],
      canonical: 'Webpack',
      category: 'tools'
    },
    {
      patterns: [
        /^vite$/i
      ],
      canonical: 'Vite',
      category: 'tools'
    },
    {
      patterns: [
        /^npm$/i
      ],
      canonical: 'npm',
      category: 'tools'
    },
    {
      patterns: [
        /^yarn$/i
      ],
      canonical: 'Yarn',
      category: 'tools'
    },
    {
      patterns: [
        /^pnpm$/i
      ],
      canonical: 'pnpm',
      category: 'tools'
    },
    {
      patterns: [
        /^jest$/i
      ],
      canonical: 'Jest',
      category: 'tools'
    },
    {
      patterns: [
        /^vitest$/i
      ],
      canonical: 'Vitest',
      category: 'tools'
    },
    {
      patterns: [
        /^playwright$/i
      ],
      canonical: 'Playwright',
      category: 'tools'
    },
    {
      patterns: [
        /^cypress$/i
      ],
      canonical: 'Cypress',
      category: 'tools'
    },
    {
      patterns: [
        /^eslint$/i
      ],
      canonical: 'ESLint',
      category: 'tools'
    },
    {
      patterns: [
        /^prettier$/i
      ],
      canonical: 'Prettier',
      category: 'tools'
    },
    
    // Web関連
    {
      patterns: [
        /^html[\s]?\d?$/i
      ],
      canonical: 'HTML',
      category: 'web'
    },
    {
      patterns: [
        /^css[\s]?\d?$/i
      ],
      canonical: 'CSS',
      category: 'web'
    },
    {
      patterns: [
        /^sass$/i,
        /^scss$/i
      ],
      canonical: 'Sass',
      category: 'web'
    },
    {
      patterns: [
        /^graphql$/i
      ],
      canonical: 'GraphQL',
      category: 'web'
    },
    {
      patterns: [
        /^rest(\s+api)?$/i,
        /^restful$/i
      ],
      canonical: 'REST API',
      category: 'web'
    },
    {
      patterns: [
        /^websocket[s]?$/i
      ],
      canonical: 'WebSocket',
      category: 'web'
    },
    {
      patterns: [
        /^jamstack$/i
      ],
      canonical: 'Jamstack',
      category: 'web'
    },
    {
      patterns: [
        /^pwa$/i,
        /^progressive\s+web\s+app$/i
      ],
      canonical: 'PWA',
      category: 'web'
    },
    
    // モバイル開発
    {
      patterns: [
        /^react\s+native$/i,
        /^reactnative$/i
      ],
      canonical: 'React Native',
      category: 'mobile'
    },
    {
      patterns: [
        /^flutter$/i
      ],
      canonical: 'Flutter',
      category: 'mobile'
    },
    {
      patterns: [
        /^ionic$/i
      ],
      canonical: 'Ionic',
      category: 'mobile'
    },
    {
      patterns: [
        /^android$/i
      ],
      canonical: 'Android',
      category: 'mobile'
    },
    {
      patterns: [
        /^ios$/i,
        /^iphone$/i,
        /^ipad$/i
      ],
      canonical: 'iOS',
      category: 'mobile'
    },
    
    // セキュリティ
    {
      patterns: [
        /^oauth[\s]?\d?$/i
      ],
      canonical: 'OAuth',
      category: 'security'
    },
    {
      patterns: [
        /^jwt$/i,
        /^json\s+web\s+token$/i
      ],
      canonical: 'JWT',
      category: 'security'
    },
    {
      patterns: [
        /^ssl$/i,
        /^tls$/i,
        /^https$/i
      ],
      canonical: 'SSL/TLS',
      category: 'security'
    },
    {
      patterns: [
        /^cors$/i
      ],
      canonical: 'CORS',
      category: 'security'
    }
  ];
  
  /**
   * タグを正規化
   */
  static normalize(tag: string): { name: string; category?: string } {
    const trimmed = tag.trim();
    
    // ルールベースの正規化
    for (const rule of this.rules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(trimmed)) {
          return {
            name: rule.canonical,
            category: rule.category
          };
        }
      }
    }
    
    // ルールに一致しない場合は、基本的な正規化のみ
    return {
      name: this.basicNormalize(trimmed),
      category: undefined
    };
  }
  
  /**
   * 基本的な正規化（大文字小文字、スペース統一）
   */
  private static basicNormalize(tag: string): string {
    // 先頭を大文字に、残りは元の大文字小文字を維持
    if (!tag) return tag;
    
    // 特殊文字の正規化
    let normalized = tag
      .replace(/\s+/g, ' ')  // 複数スペースを1つに
      .replace(/[_]+/g, '-')  // アンダースコアをハイフンに
      .trim();
    
    // 完全に大文字の略語（AWS, API等）はそのまま
    if (/^[A-Z]+$/.test(normalized)) {
      return normalized;
    }
    
    // 頭文字を大文字に（略語でない場合）
    if (!/^[A-Z]{2,}/.test(normalized)) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    
    return normalized;
  }
  
  /**
   * タグ配列を正規化し、重複を削除
   */
  static normalizeTags(tags: string[]): Array<{ name: string; category?: string }> {
    const normalizedMap = new Map<string, { name: string; category?: string }>();
    
    for (const tag of tags) {
      const normalized = this.normalize(tag);
      // 重複を避けるため、正規化後の名前をキーとして使用
      if (!normalizedMap.has(normalized.name)) {
        normalizedMap.set(normalized.name, normalized);
      }
    }
    
    return Array.from(normalizedMap.values());
  }
  
  /**
   * カテゴリを推測（最初のタグのカテゴリを使用）
   */
  static inferCategory(tags: Array<{ name: string; category?: string }>): string | undefined {
    for (const tag of tags) {
      if (tag.category) {
        return tag.category;
      }
    }
    return undefined;
  }
}