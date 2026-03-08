/**
 * コンテンツ品質ルール定義
 * 技術用語辞書と英語混入チェック機能
 */

// 技術用語辞書（継続的に更新）
export const TECHNICAL_TERMS = new Set([
  // プログラミング言語
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'Go',
  'Rust',
  'Ruby',
  'PHP',
  'C++',
  'C#',
  'Swift',
  'Kotlin',
  'Scala',
  'Haskell',
  'Elixir',
  'C',

  // フレームワーク・ライブラリ
  'React',
  'Vue',
  'Angular',
  'Next.js',
  'Nuxt',
  'Express',
  'Django',
  'Flask',
  'Spring',
  'Rails',
  'Laravel',
  'Node.js',
  'Deno',
  'Bun',
  'Svelte',
  'Solid',
  'Remix',
  'Astro',
  'Vite',
  'Webpack',
  'Rollup',
  'Parcel',
  'esbuild',
  'SWC',

  // クラウド・インフラ
  'AWS',
  'GCP',
  'Azure',
  'Docker',
  'Kubernetes',
  'Terraform',
  'Ansible',
  'Jenkins',
  'GitHub',
  'GitLab',
  'Bitbucket',
  'CircleCI',
  'Travis',
  'Vercel',
  'Netlify',
  'Cloudflare',
  'Heroku',
  'DigitalOcean',
  'Linode',
  'Vultr',

  // 技術概念
  'API',
  'REST',
  'GraphQL',
  'WebSocket',
  'CI/CD',
  'DevOps',
  'AI',
  'ML',
  'LLM',
  'HTTP',
  'HTTPS',
  'TCP/IP',
  'DNS',
  'CDN',
  'SQL',
  'NoSQL',
  'JWT',
  'OAuth',
  'CORS',
  'XSS',
  'CSRF',
  'SSL',
  'TLS',
  'SSH',
  'FTP',
  'SMTP',
  'WebRTC',
  'PWA',
  'SPA',
  'SSR',
  'SSG',
  'ISR',
  'CSR',
  'SEO',
  'ORM',

  // データベース
  'MySQL',
  'PostgreSQL',
  'MongoDB',
  'Redis',
  'Elasticsearch',
  'DynamoDB',
  'Firestore',
  'SQLite',
  'Oracle',
  'Cassandra',
  'MariaDB',
  'CouchDB',
  'Supabase',
  'Firebase',
  'Prisma',
  'TypeORM',
  'Sequelize',
  'Mongoose',

  // その他ツール
  'IDE',
  'VSCode',
  'IntelliJ',
  'npm',
  'yarn',
  'pnpm',
  'git',
  'bash',
  'zsh',
  'vim',
  'emacs',
  'tmux',
  'grep',
  'sed',
  'awk',
  'curl',
  'wget',
  'jq',
  'Chrome',
  'Firefox',
  'Safari',
  'Edge',
  'Postman',
  'Insomnia',
  'Figma',
  'Sketch',
  'Adobe',
  'Photoshop',
  'Illustrator',
  'Slack',
  'Discord',
  'Teams',
]);

export interface EnglishCheckResult {
  hasProblematicEnglish: boolean;
  problematicPhrases: string[];
  allowedTerms: string[];
  severity: 'none' | 'minor' | 'major' | 'critical';
}

export function checkEnglishMixing(summary: string): EnglishCheckResult {
  const result: EnglishCheckResult = {
    hasProblematicEnglish: false,
    problematicPhrases: [],
    allowedTerms: [],
    severity: 'none',
  };

  // Step 1: 引用符で囲まれた部分を一時的に除外
  const quotedTexts: string[] = [];
  const withoutQuotes = summary.replace(
    /[「『"'`]([^」』"'`]+)[」』"'`]/g,
    (match, quoted) => {
      quotedTexts.push(quoted);
      return '__QUOTED__';
    }
  );

  // Step 2: URLやファイルパスを除外
  const withoutUrls = withoutQuotes.replace(
    /(?:https?:\/\/|localhost:|\/[\w\-\.\/]+)/g,
    '__PATH__'
  );

  // Step 3: 技術用語を識別して保存
  const foundTechTerms: string[] = [];
  let processedText = withoutUrls;

  TECHNICAL_TERMS.forEach((term) => {
    // 特殊文字をエスケープ
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // CI/CDのようなスラッシュを含む用語、またはC++/C#のような\bが機能しない特殊文字末尾の用語は
    // lookaroundパターンを使用する
    const hasSpecialBoundary = term.includes('/') || /[+#]$/.test(term);
    const regex = hasSpecialBoundary
      ? new RegExp(`(?<![\\w])${escapedTerm}(?![\\w])`, 'gi')
      : new RegExp(`\\b${escapedTerm}\\b`, 'gi');
    if (regex.test(processedText)) {
      foundTechTerms.push(term);
      processedText = processedText.replace(regex, '__TECH__');
    }
  });

  result.allowedTerms = foundTechTerms;

  // Step 4: エラーメッセージパターンを除外
  processedText = processedText.replace(
    /(?:Error|Warning|Info|Debug):\s*[A-Za-z\s]+/g,
    '__ERROR__'
  );

  // Step 5: 数値＋単位の英語表現を除外（例：10GB, 5ms）
  processedText = processedText.replace(
    /\d+\s*(?:GB|MB|KB|ms|s|min|hour|day|TB|PB|ns|μs|px|em|rem|vh|vw|%)/gi,
    '__UNIT__'
  );

  // Step 6: 問題のある英語パターンを検出
  const problematicPatterns: Array<{
    pattern: RegExp;
    severity: 'minor' | 'major' | 'critical';
    description: string;
  }> = [
    // Critical: 文法構造の混在
    {
      pattern: /\b(?:This|That|These|Those)\s+(?:[ぁ-んァ-ヶ亜-熙])/,
      severity: 'critical',
      description: '英語指示語＋日本語名詞',
    },
    {
      pattern: /(?:[ぁ-んァ-ヶ亜-熙]+)\s+(?:is|are|was|were|be|been|being)\s+/,
      severity: 'critical',
      description: '日本語名詞＋英語be動詞',
    },
    {
      pattern:
        /(?:[ぁ-んァ-ヶ亜-熙]+)\s+(?:will|can|could|should|must|may|might)\s+/,
      severity: 'critical',
      description: '日本語名詞＋英語助動詞',
    },

    // Major: 英文の混入
    {
      pattern: /^(?:The|A|An)\s+[a-z]+\s+(?:is|are|was|were)/i,
      severity: 'major',
      description: '完全な英文の開始',
    },
    {
      pattern: /\b(?:Let's|let's|We|You|I)\s+[a-z]+/i,
      severity: 'major',
      description: '英語の命令文・提案文',
    },

    // Minor: 不自然な英単語（ただし文脈による）
    {
      pattern: /(?:[ぁ-んァ-ヶ亜-熙]+)\s+(?:available|enable|disable|support)/i,
      severity: 'minor',
      description: '日本語＋英語形容詞/動詞',
    },
  ];

  // パターンマッチングと問題箇所の抽出
  let maxSeverity: 'none' | 'minor' | 'major' | 'critical' = 'none';

  problematicPatterns.forEach(({ pattern, severity, description }) => {
    const matches = processedText.match(pattern);
    if (matches) {
      result.hasProblematicEnglish = true;

      // processedText のマッチ結果をそのまま使用する（元テキストへの再マッチは
      // 技術用語置換後のテキストと異なるため誤検出が発生する）
      result.problematicPhrases.push(`${matches[0]} (${description})`);

      // 最も深刻な問題レベルを記録
      if (severity === 'critical') maxSeverity = 'critical';
      else if (severity === 'major' && maxSeverity !== 'critical')
        maxSeverity = 'major';
      else if (severity === 'minor' && maxSeverity === 'none')
        maxSeverity = 'minor';
    }
  });

  result.severity = maxSeverity;

  // Step 7: 追加の文脈チェック（false positive除去）
  if (result.hasProblematicEnglish) {
    // 記事タイトルの引用の場合は許容
    if (summary.includes('「') && summary.includes('」')) {
      const titlePattern = /「[^」]*[A-Za-z]+[^」]*」/;
      if (titlePattern.test(summary)) {
        // タイトル引用内の英語は許容
        const currentSeverity = result.severity as string;
        result.severity =
          currentSeverity === 'critical'
            ? 'major'
            : currentSeverity === 'major'
              ? 'minor'
              : 'none';
      }
    }
  }

  return result;
}
