import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

export class TechTermsManager {
  private static instance: TechTermsManager;
  private terms: Set<string>;
  private lastUpdated: Date;
  private customTermsPath: string;
  
  private constructor() {
    this.terms = new Set([
      // プログラミング言語
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'PHP',
      'C++', 'C#', 'Swift', 'Kotlin', 'Scala', 'Haskell', 'Elixir', 'C',
      
      // フレームワーク・ライブラリ
      'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Express', 'Django', 'Flask',
      'Spring', 'Rails', 'Laravel', 'Node.js', 'Deno', 'Bun', 'Svelte', 'Solid',
      'Remix', 'Astro', 'Vite', 'Webpack', 'Rollup', 'Parcel', 'esbuild', 'SWC',
      
      // クラウド・インフラ
      'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'Ansible',
      'Jenkins', 'GitHub', 'GitLab', 'Bitbucket', 'CircleCI', 'Travis', 'Vercel',
      'Netlify', 'Cloudflare', 'Heroku', 'DigitalOcean', 'Linode', 'Vultr',
      
      // 技術概念
      'API', 'REST', 'GraphQL', 'WebSocket', 'CI/CD', 'DevOps', 'AI', 'ML',
      'LLM', 'HTTP', 'HTTPS', 'TCP/IP', 'DNS', 'CDN', 'SQL', 'NoSQL', 'JWT',
      'OAuth', 'CORS', 'XSS', 'CSRF', 'SSL', 'TLS', 'SSH', 'FTP', 'SMTP',
      'WebRTC', 'PWA', 'SPA', 'SSR', 'SSG', 'ISR', 'CSR', 'SEO', 'ORM',
      
      // データベース
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB',
      'Firestore', 'SQLite', 'Oracle', 'Cassandra', 'MariaDB', 'CouchDB',
      'Supabase', 'Firebase', 'Prisma', 'TypeORM', 'Sequelize', 'Mongoose',
      
      // その他ツール
      'IDE', 'VSCode', 'IntelliJ', 'npm', 'yarn', 'pnpm', 'git', 'bash', 'zsh',
      'vim', 'emacs', 'tmux', 'grep', 'sed', 'awk', 'curl', 'wget', 'jq',
      'Chrome', 'Firefox', 'Safari', 'Edge', 'Postman', 'Insomnia', 'Figma',
      'Sketch', 'Adobe', 'Photoshop', 'Illustrator', 'Slack', 'Discord', 'Teams'
    ]);
    
    this.lastUpdated = new Date();
    this.customTermsPath = path.join(process.cwd(), 'data', 'custom-tech-terms.json');
  }
  
  public static getInstance(): TechTermsManager {
    if (!TechTermsManager.instance) {
      TechTermsManager.instance = new TechTermsManager();
    }
    return TechTermsManager.instance;
  }
  
  // 技術用語を取得
  public getTerms(): Set<string> {
    return new Set(this.terms);
  }
  
  // カスタム用語を追加
  public addCustomTerms(terms: string[]): void {
    terms.forEach(term => {
      if (term && term.length > 0) {
        this.terms.add(term);
      }
    });
  }
  
  // カスタム用語をファイルに保存
  public async saveCustomTerms(): Promise<void> {
    try {
      const dir = path.dirname(this.customTermsPath);
      await fs.mkdir(dir, { recursive: true });
      
      const customTerms = Array.from(this.terms);
      await fs.writeFile(
        this.customTermsPath,
        JSON.stringify({ terms: customTerms, updated: new Date() }, null, 2)
      );
    } catch (error) {
    }
  }
  
  // カスタム用語をファイルから読み込み
  public async loadCustomTerms(): Promise<void> {
    try {
      const data = await fs.readFile(this.customTermsPath, 'utf-8');
      const { terms } = JSON.parse(data);
      this.addCustomTerms(terms);
    } catch (error) {
      // ファイルが存在しない場合は無視
      if ((error as unknown).code !== 'ENOENT') {
      }
    }
  }
  
  // リモートソースから用語を更新
  public async updateFromRemote(url?: string): Promise<void> {
    const updateUrl = url || process.env.TECH_TERMS_UPDATE_URL;
    
    if (!updateUrl) {
      return;
    }
    
    try {
      const response = await fetch(updateUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json() as { terms: string[] };
      if (data.terms && Array.isArray(data.terms)) {
        this.addCustomTerms(data.terms);
        this.lastUpdated = new Date();
        await this.saveCustomTerms();
      }
    } catch (error) {
    }
  }
  
  // 使用頻度を記録（メトリクス用）
  private usageStats: Map<string, number> = new Map();
  
  public recordUsage(term: string): void {
    const count = this.usageStats.get(term) || 0;
    this.usageStats.set(term, count + 1);
  }
  
  // 使用統計を取得
  public getUsageStats(): Map<string, number> {
    return new Map(this.usageStats);
  }
  
  // 統計をリセット
  public resetUsageStats(): void {
    this.usageStats.clear();
  }
  
  // 最終更新日時を取得
  public getLastUpdated(): Date {
    return this.lastUpdated;
  }
  
  // 用語数を取得
  public getTermCount(): number {
    return this.terms.size;
  }
  
  // 用語の検索（部分一致）
  public searchTerms(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.terms).filter(term => 
      term.toLowerCase().includes(lowerQuery)
    );
  }
  
  // 用語の存在確認
  public hasTerm(term: string): boolean {
    return this.terms.has(term);
  }
  
  // 用語を削除
  public removeTerm(term: string): boolean {
    return this.terms.delete(term);
  }
}

// シングルトンインスタンスをエクスポート
export const techTermsManager = TechTermsManager.getInstance();