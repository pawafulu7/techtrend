// タグカテゴリー定義
export const TAG_CATEGORIES = {
  frontend: {
    name: 'フロントエンド',
    description: 'UI/UX、クライアントサイド技術',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    tags: [
      'React', 'Vue', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js', 'Svelte',
      'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
      'Webpack', 'Vite', 'Rollup', 'Parcel', 'esbuild',
      'Redux', 'MobX', 'Recoil', 'Zustand', 'Pinia',
      'React Native', 'Flutter', 'Ionic', 'Electron',
      'PWA', 'WebAssembly', 'WebGL', 'Canvas',
      'Material-UI', 'Ant Design', 'Chakra UI', 'Bootstrap',
      'Jest', 'Cypress', 'Playwright', 'Testing Library',
      'Storybook', 'Figma', 'Adobe XD', 'Sketch'
    ]
  },
  backend: {
    name: 'バックエンド',
    description: 'サーバーサイド、API開発',
    color: 'text-green-600 bg-green-50 border-green-200',
    tags: [
      'Node.js', 'Express', 'Fastify', 'NestJS', 'Koa',
      'Python', 'Django', 'Flask', 'FastAPI', 'SQLAlchemy',
      'Ruby', 'Rails', 'Ruby on Rails', 'Sinatra',
      'Java', 'Spring', 'Spring Boot', 'Kotlin', 'Quarkus',
      'Go', 'Golang', 'Gin', 'Echo', 'Fiber',
      'PHP', 'Laravel', 'Symfony', 'CodeIgniter',
      'C#', '.NET', 'ASP.NET', 'Entity Framework',
      'Rust', 'Actix', 'Rocket', 'Tokio',
      'GraphQL', 'REST', 'gRPC', 'WebSocket', 'Socket.IO',
      'OAuth', 'JWT', 'Session', 'Authentication', 'Authorization'
    ]
  },
  infrastructure: {
    name: 'インフラ',
    description: 'クラウド、DevOps、インフラ管理',
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    tags: [
      'AWS', 'EC2', 'S3', 'Lambda', 'CloudFormation', 'ECS', 'EKS',
      'Google Cloud', 'GCP', 'GKE', 'Cloud Functions', 'BigQuery',
      'Azure', 'Azure Functions', 'Azure DevOps',
      'Docker', 'Kubernetes', 'k8s', 'Helm', 'Istio',
      'Terraform', 'Ansible', 'Chef', 'Puppet',
      'Nginx', 'Apache', 'HAProxy', 'Traefik',
      'Prometheus', 'Grafana', 'ELK', 'Datadog', 'New Relic',
      'Linux', 'Ubuntu', 'CentOS', 'Debian', 'RHEL',
      'Serverless', 'Microservices', 'Service Mesh'
    ]
  },
  database: {
    name: 'データベース',
    description: 'データストレージ、クエリ最適化',
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    tags: [
      'MySQL', 'PostgreSQL', 'MariaDB', 'Oracle', 'SQL Server',
      'MongoDB', 'DynamoDB', 'Cassandra', 'CouchDB', 'Neo4j',
      'Redis', 'Memcached', 'Elasticsearch', 'Solr',
      'SQLite', 'H2', 'Derby',
      'Prisma', 'TypeORM', 'Sequelize', 'Mongoose', 'Knex',
      'SQL', 'NoSQL', 'GraphDB', 'Time Series', 'Vector DB',
      'Database Design', 'Query Optimization', 'Indexing', 'Sharding',
      'Data Warehouse', 'Data Lake', 'ETL', 'Data Pipeline'
    ]
  },
  ai_ml: {
    name: 'AI/機械学習',
    description: '人工知能、機械学習、データサイエンス',
    color: 'text-pink-600 bg-pink-50 border-pink-200',
    tags: [
      'AI', '人工知能', 'Machine Learning', '機械学習', 'Deep Learning',
      'TensorFlow', 'PyTorch', 'Keras', 'scikit-learn', 'XGBoost',
      'OpenAI', 'ChatGPT', 'GPT-4', 'Claude', 'Gemini', 'LLM',
      'Computer Vision', 'NLP', '自然言語処理', 'Image Recognition',
      'Pandas', 'NumPy', 'Jupyter', 'Matplotlib', 'Seaborn',
      'Hugging Face', 'Transformers', 'BERT', 'GPT',
      'MLOps', 'Kubeflow', 'MLflow', 'Weights & Biases',
      'Data Science', 'Statistics', 'R', 'SageMaker',
      'Reinforcement Learning', 'Neural Networks', 'CNN', 'RNN', 'GAN'
    ]
  },
  devops: {
    name: 'DevOps',
    description: '開発運用、自動化、監視',
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    tags: [
      'DevOps', 'SRE', 'GitOps', 'Platform Engineering',
      'CI/CD', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI',
      'Monitoring', 'Logging', 'Observability', 'APM',
      'IaC', 'Infrastructure as Code', 'Configuration Management',
      'Continuous Integration', 'Continuous Deployment', 'Continuous Delivery',
      'Test Automation', 'Performance Testing', 'Load Testing',
      'Security', 'DevSecOps', 'SAST', 'DAST', 'Vulnerability',
      'Incident Management', 'Chaos Engineering', 'Disaster Recovery',
      'Cost Optimization', 'FinOps', 'Resource Management',
      'Documentation', 'Knowledge Management', 'Runbook'
    ]
  }
} as const;

export type TagCategory = keyof typeof TAG_CATEGORIES;

// タグからカテゴリーを判定する関数
export function getTagCategory(tagName: string): TagCategory | null {
  const normalizedTag = tagName.toLowerCase();
  
  for (const [category, config] of Object.entries(TAG_CATEGORIES)) {
    const normalizedTags = config.tags.map(tag => tag.toLowerCase());
    if (normalizedTags.includes(normalizedTag)) {
      return category as TagCategory;
    }
  }
  
  return null;
}

// カテゴリー情報を取得する関数
export function getCategoryInfo(category: TagCategory) {
  return TAG_CATEGORIES[category];
}

// すべてのカテゴリーを取得する関数
export function getAllCategories() {
  return Object.entries(TAG_CATEGORIES).map(([key, value]) => ({
    key: key as TagCategory,
    ...value
  }));
}