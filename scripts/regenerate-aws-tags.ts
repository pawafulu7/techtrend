import { PrismaClient, Article, Tag } from '@prisma/client';
import { logger } from '@/lib/cli/utils/logger';

const prisma = new PrismaClient();

type ArticleWithTags = Article & {
  tags: Tag[];
};

interface RegenerateResult {
  processed: number;
  updated: number;
  errors: number;
}

// AWSFetcherから抽出したサービスリスト
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

// タグを抽出する関数（AWSFetcherのロジックを再利用）
function extractAwsTags(title: string, content: string): string[] {
  const tags: string[] = [];
  const fullContent = `${title} ${content}`;
  
  // サービス名の変形パターンに対応した抽出
  for (const service of awsServices) {
    const patterns = [
      new RegExp(`\\b${service}\\b`, 'i'),
      new RegExp(`\\bAmazon ${service}\\b`, 'i'),
      new RegExp(`\\bAWS ${service}\\b`, 'i')
    ];
    
    if (patterns.some(pattern => pattern.test(fullContent))) {
      tags.push(service);
    }
  }
  
  // AWS タグを先頭に追加（既存のタグと統合するため）
  if (tags.length > 0) {
    tags.unshift('AWS');
  }
  
  return [...new Set(tags)]; // 重複を削除
}

async function regenerateAwsTags(): Promise<RegenerateResult> {
  logger.info('AWS記事のタグ再生成を開始します...');
  const startTime = Date.now();
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    // 1. AWS記事を取得（AWSタグのみ、または2個以下のタグを持つ記事）
    const awsArticles = await prisma.article.findMany({
      where: {
        OR: [
          // AWSタグのみを持つ記事
          {
            tags: {
              every: { name: 'AWS' },
              some: { name: 'AWS' }
            }
          },
          // タイトルまたはURLにAWSが含まれる記事
          {
            OR: [
              { title: { contains: 'AWS' } },
              { title: { contains: 'Amazon' } },
              { url: { contains: 'aws.amazon.com' } }
            ]
          }
        ]
      },
      include: { tags: true },
      orderBy: { publishedAt: 'desc' }
    }) as ArticleWithTags[];
    
    // タグが少ない記事をフィルタリング（3個以下）
    const targetArticles = awsArticles.filter(article => 
      article.tags.length <= 3 || 
      (article.tags.length === 1 && article.tags[0].name === 'AWS')
    );
    
    logger.info(`処理対象: ${targetArticles.length}件のAWS記事`);
    
    // バッチ処理で更新
    for (const article of targetArticles) {
      try {
        processed++;
        
        // 既存のタグ名を取得
        const existingTagNames = article.tags.map(t => t.name);
        
        // 新しいタグを抽出
        const newTags = extractAwsTags(
          article.title,
          article.content || article.summary || ''
        );
        
        // 変更がある場合のみ更新
        const hasNewTags = newTags.some(tag => !existingTagNames.includes(tag));
        
        if (hasNewTags) {
          // 既存のタグと新しいタグをマージ
          const allTagNames = [...new Set([...existingTagNames, ...newTags])];
          
          // タグレコードを作成または取得
          const tagRecords = await Promise.all(
            allTagNames.map(async (tagName) => {
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName }
              });
              return tag;
            })
          );
          
          // 記事のタグを更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                set: [], // 既存の関連をクリア
                connect: tagRecords.map(tag => ({ id: tag.id }))
              }
            }
          });
          
          updated++;
          logger.success(
            `更新: ${article.title.substring(0, 50)}... ` +
            `(${existingTagNames.join(', ')} → ${allTagNames.join(', ')})`
          );
        } else {
          logger.info(`スキップ: ${article.title.substring(0, 50)}... (変更なし)`);
        }
        
        // 進捗表示
        if (processed % 10 === 0) {
          logger.info(`進捗: ${processed}/${targetArticles.length}`);
        }
        
      } catch (error) {
        errors++;
        logger.error(
          `エラー: ${article.title.substring(0, 50)}...`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    logger.info('');
    logger.info('=== タグ再生成完了 ===');
    logger.info(`処理記事数: ${processed}件`);
    logger.info(`更新記事数: ${updated}件`);
    logger.info(`エラー数: ${errors}件`);
    logger.info(`処理時間: ${duration}秒`);
    
    return { processed, updated, errors };
    
  } catch (error) {
    logger.error('タグ再生成中にエラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  regenerateAwsTags()
    .then((result) => {
      if (result.errors > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { regenerateAwsTags };