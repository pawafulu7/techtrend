import { AWSFetcher } from '@/lib/fetchers/aws';
import { Source } from '@prisma/client';

// テスト用のソースオブジェクト
const mockSource: Source = {
  id: 'test-aws-source',
  name: 'AWS',
  type: 'rss',
  url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('AWSFetcher', () => {
  let fetcher: AWSFetcher;

  beforeEach(() => {
    fetcher = new AWSFetcher(mockSource);
  });

  describe('extractTags', () => {
    // privateメソッドをテストするためのヘルパー関数
    const extractTags = (item: any, feedName: string): string[] => {
      return (fetcher as any).extractTags(item, feedName);
    };

    it('タイトルからEC2サービスを抽出できる', () => {
      const item = {
        title: 'Amazon EC2 now supports force terminate for EC2 instances',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('EC2');
    });

    it('複数のAWSサービスを同時に抽出できる', () => {
      const item = {
        title: 'AWS Lambda now integrates with Amazon S3 and DynamoDB',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('Lambda');
      expect(tags).toContain('S3');
      expect(tags).toContain('DynamoDB');
    });

    it('サービス名の変形パターンに対応できる', () => {
      const item = {
        title: 'Updates to Amazon CloudWatch and AWS CloudFormation',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('CloudWatch');
      expect(tags).toContain('CloudFormation');
    });

    it('コンテンツからもサービス名を抽出できる', () => {
      const item = {
        title: 'New AWS service announcement',
        content: 'This update includes improvements to Amazon RDS and AWS Glue functionality',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('RDS');
      expect(tags).toContain('AWS Glue');
    });

    it('大文字小文字を区別せずにサービス名を抽出できる', () => {
      const item = {
        title: 'amazon ec2 and aws lambda updates',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('EC2');
      expect(tags).toContain('Lambda');
    });

    it('重複したタグを削除する', () => {
      const item = {
        title: 'EC2 updates for Amazon EC2 instances',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      const ec2Count = tags.filter(tag => tag === 'EC2').length;
      expect(ec2Count).toBe(1);
    });

    it('新しいサービス名も抽出できる', () => {
      const item = {
        title: 'Introducing AWS Bedrock for generative AI applications',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('Bedrock');
    });

    it('IoTサービスを正しく抽出できる', () => {
      const item = {
        title: 'AWS IoT Core now supports IoT Device Management features',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('IoT Core');
      expect(tags).toContain('IoT Device Management');
    });

    it('セキュリティサービスを正しく抽出できる', () => {
      const item = {
        title: 'AWS Security Hub integrates with Amazon GuardDuty and AWS WAF',
        categories: []
      };
      const tags = extractTags(item, 'WhatsNew');
      
      expect(tags).toContain('AWS');
      expect(tags).toContain('Security Hub');
      expect(tags).toContain('GuardDuty');
      expect(tags).toContain('WAF');
    });

    it('フィード別の追加タグが正しく付与される', () => {
      const securityItem = {
        title: 'Security update for AWS services',
        categories: []
      };
      const securityTags = extractTags(securityItem, 'Security');
      
      expect(securityTags).toContain('AWS');
      expect(securityTags).toContain('セキュリティ');
      expect(securityTags).toContain('Security');
      
      const blogItem = {
        title: 'AWS Blog post about new features',
        categories: []
      };
      const blogTags = extractTags(blogItem, 'Blog');
      
      expect(blogTags).toContain('AWS');
      expect(blogTags).toContain('ブログ');
      expect(blogTags).toContain('Blog');
    });
  });
});