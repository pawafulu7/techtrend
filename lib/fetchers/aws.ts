import Parser from 'rss-parser';
import { Source } from '@prisma/client';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface AWSRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  'dc:creator'?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  enclosure?: {
    url?: string;
    type?: string;
  };
}

export class AWSFetcher extends BaseFetcher {
  private parser: Parser<unknown, AWSRSSItem>;
  
  // 3つのAWSフィードを統合
  private rssUrls = [
    { url: 'https://aws.amazon.com/jp/security/security-bulletins/rss/feed/', name: 'Security' },
    { url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', name: 'WhatsNew' },
    { url: 'https://aws.amazon.com/jp/blogs/aws/feed/', name: 'Blog' },
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:creator', 'dcCreator'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // 現在日時を取得（未来日付フィルタ用）
    const now = new Date();

    // 各RSSフィードから記事を取得
    for (const feedInfo of this.rssUrls) {
      try {
        const feed = await this.retry(() => this.parser.parseURL(feedInfo.url));
        
        if (!feed.items || feed.items.length === 0) {
          continue;
        }


        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;
            
            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);

            // 既存のカテゴリにAWSタグと取得元を追加
            const tags = this.extractTags(item, feedInfo.name);
            
            // 取得元をタグとして追加
            const sourceMap: Record<string, string> = {
              'Security': 'Security Bulletins',
              // 'WhatsNew': "What's New", // 削除：冗長なタグ
              'Blog': 'News Blog'
            };
            const sourceTag = sourceMap[feedInfo.name];
            if (sourceTag && !tags.includes(sourceTag)) {
              tags.unshift(sourceTag);
            }
            
            tags.unshift('AWS'); // 必ずAWSタグを先頭に追加

            const publishedAt = item.isoDate ? new Date(item.isoDate) :
                          item.pubDate ? parseRSSDate(item.pubDate) : new Date();
            
            // 30日以内かつ未来でない記事のみ処理
            if (publishedAt < thirtyDaysAgo || publishedAt > now) {
              if (publishedAt > now) {
              }
              continue;
            }

            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: item.content || item.contentSnippet || '',
              publishedAt,
              sourceId: this.source.id,
              tagNames: tags,
            };

            // サムネイルを抽出
            if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
              article.thumbnail = item.enclosure.url;
            } else if (article.content) {
              const thumbnail = this.extractThumbnail(article.content);
              if (thumbnail) {
                article.thumbnail = thumbnail;
              }
            }

            allArticles.push(article);
          } catch (_error) {
            allErrors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
          }
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (_error) {
        allErrors.push(new Error(`Failed to fetch AWS ${feedInfo.name} feed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // 日付順にソートして最新60件を返す
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = allArticles.slice(0, 60);

    return { articles: limitedArticles, errors: allErrors };
  }

  private extractTags(item: AWSRSSItem, feedName: string): string[] {
    const tags: string[] = [];

    // カテゴリから抽出（空文字列を除外）
    if (item.categories && item.categories.length > 0) {
      const validCategories = item.categories
        .filter(cat => cat && cat.trim().length > 0)
        .map(cat => cat.trim());
      tags.push(...validCategories);
    }

    // フィード別の追加タグ
    if (feedName === 'Security') {
      tags.push('セキュリティ', 'Security');
    } else if (feedName === 'WhatsNew') {
      // tags.push('新機能', 'Updates'); // 削除：冗長なタグ
    } else if (feedName === 'Blog') {
      tags.push('ブログ', 'Blog');
    }

    // タイトルとコンテンツからサービス名を抽出
    const title = item.title || '';
    const content = `${title} ${item.content || ''} ${item.contentSnippet || ''}`;
    
    const awsServices = [
      // コンピューティング
      'EC2', 'Lambda', 'Batch', 'Elastic Beanstalk', 'Serverless Application Repository',
      'AWS Outposts', 'AWS Snow Family', 'AWS Wavelength', 'VMware Cloud on AWS',
      'Lightsail', 'AWS Local Zones', 'AWS Compute Optimizer', 'EC2 Image Builder',
      
      // コンテナ
      'ECS', 'EKS', 'Fargate', 'ECR', 'AWS App Runner', 'AWS Copilot',
      
      // ストレージ
      'S3', 'EFS', 'FSx', 'Storage Gateway', 'AWS Backup', 'AWS Elastic Disaster Recovery',
      'AWS DataSync', 'AWS Transfer Family', 'AWS Snow Family',
      
      // データベース
      'RDS', 'DynamoDB', 'ElastiCache', 'Neptune', 'Amazon Keyspaces',
      'Amazon DocumentDB', 'Amazon MemoryDB', 'Amazon Timestream', 'Amazon QLDB',
      'RDS Proxy', 'Aurora', 'RDS on VMware', 'DynamoDB Accelerator',
      
      // 分析
      'Athena', 'EMR', 'CloudSearch', 'Elasticsearch Service', 'Kinesis',
      'QuickSight', 'Data Pipeline', 'AWS Glue', 'Lake Formation', 'MSK',
      'OpenSearch Service', 'AWS Data Exchange', 'AWS Clean Rooms',
      'Kinesis Data Firehose', 'Kinesis Data Analytics', 'Kinesis Video Streams',
      
      // 機械学習
      'SageMaker', 'Bedrock', 'Comprehend', 'Forecast', 'Fraud Detector',
      'Kendra', 'Lex', 'Personalize', 'Polly', 'Rekognition', 'Textract',
      'Transcribe', 'Translate', 'Augmented AI', 'DeepLens', 'DeepRacer',
      'CodeGuru', 'DevOps Guru', 'Lookout for Equipment', 'Lookout for Metrics',
      'Lookout for Vision', 'Monitron', 'HealthLake', 'Omics',
      
      // 開発者ツール
      'CodeCommit', 'CodeBuild', 'CodeDeploy', 'CodePipeline', 'CodeStar',
      'Cloud9', 'CloudShell', 'X-Ray', 'CodeArtifact', 'AWS CDK',
      'CloudFormation', 'AWS SAM', 'AWS Amplify', 'AWS App Runner',
      
      // 管理とガバナンス
      'CloudWatch', 'Systems Manager', 'CloudTrail', 'Config', 'OpsWorks',
      'Service Catalog', 'AWS Organizations', 'Control Tower', 'AWS Well-Architected Tool',
      'Personal Health Dashboard', 'License Manager', 'Compute Optimizer',
      'Launch Wizard', 'Resource Groups', 'Tag Editor', 'Chatbot',
      
      // ネットワーキングとコンテンツ配信
      'VPC', 'CloudFront', 'Route 53', 'API Gateway', 'Direct Connect',
      'AWS VPN', 'Transit Gateway', 'Elastic Load Balancing', 'Global Accelerator',
      'AWS PrivateLink', 'AWS App Mesh', 'AWS Cloud Map', 'Network Firewall',
      
      // セキュリティ、アイデンティティ、コンプライアンス
      'IAM', 'Secrets Manager', 'Certificate Manager', 'WAF', 'Shield',
      'GuardDuty', 'Inspector', 'Macie', 'Security Hub', 'Detective',
      'AWS Single Sign-On', 'Directory Service', 'Resource Access Manager',
      'CloudHSM', 'Key Management Service', 'Network Firewall', 'Firewall Manager',
      'Audit Manager', 'AWS Signer', 'AWS Private Certificate Authority',
      
      // アプリケーション統合
      'Step Functions', 'EventBridge', 'SNS', 'SQS', 'AppSync', 'MQ',
      'Simple Workflow Service', 'Managed Workflows for Apache Airflow',
      
      // カスタマーエンゲージメント
      'SES', 'Pinpoint', 'Amazon Connect', 'Simple Email Service',
      
      // ビジネスアプリケーション
      'Alexa for Business', 'WorkSpaces', 'AppStream 2.0', 'WorkDocs',
      'WorkMail', 'Chime', 'Honeycode', 'WorkSpaces Web',
      
      // IoT
      'IoT Core', 'IoT Device Management', 'IoT Analytics', 'IoT Events',
      'IoT SiteWise', 'IoT Things Graph', 'IoT Greengrass', 'IoT 1-Click',
      'IoT Device Defender', 'IoT FleetWise', 'IoT TwinMaker',
      
      // ゲーム開発
      'GameLift', 'Lumberyard',
      
      // メディアサービス
      'Elastic Transcoder', 'Elemental MediaConnect', 'Elemental MediaConvert',
      'Elemental MediaLive', 'Elemental MediaPackage', 'Elemental MediaStore',
      'Elemental MediaTailor', 'Interactive Video Service', 'Nimble Studio',
      
      // 移行と転送
      'Migration Hub', 'Application Discovery Service', 'Database Migration Service',
      'Server Migration Service', 'DataSync', 'Transfer Family',
      
      // その他のサービス
      'Ground Station', 'RoboMaker', 'Quantum Ledger Database', 'Blockchain Templates',
      'Managed Blockchain', 'Braket', 'Sumerian', 'Location Service'
    ];

    // サービス名の変形パターンに対応した抽出
    for (const service of awsServices) {
      const patterns = [
        new RegExp(`\\b${service}\\b`, 'i'),
        new RegExp(`\\bAmazon ${service}\\b`, 'i'),
        new RegExp(`\\bAWS ${service}\\b`, 'i')
      ];
      
      if (patterns.some(pattern => pattern.test(content))) {
        tags.push(service);
      }
    }

    // 重複を削除
    return [...new Set(tags)];
  }
}