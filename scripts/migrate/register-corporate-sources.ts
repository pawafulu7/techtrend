#!/usr/bin/env npx tsx
/**
 * 企業ブログを個別のソースとして登録するスクリプト
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CorporateSource {
  id: string;
  name: string;
  url: string;
  domain: string;
  type: 'rss' | 'manual';
}

const corporateSources: CorporateSource[] = [
  {
    id: 'freee_tech_blog',
    name: 'freee Developers Hub',
    url: 'https://developers.freee.co.jp/rss',
    domain: 'developers.freee.co.jp',
    type: 'rss'
  },
  {
    id: 'cyberagent_tech_blog',
    name: 'CyberAgent Developers Blog',
    url: 'https://developers.cyberagent.co.jp/blog/feed/',
    domain: 'developers.cyberagent.co.jp',
    type: 'rss'
  },
  {
    id: 'dena_tech_blog',
    name: 'DeNA Engineering',
    url: 'https://engineering.dena.com/blog/index.xml',
    domain: 'engineering.dena.com',
    type: 'rss'
  },
  {
    id: 'smarthr_tech_blog',
    name: 'SmartHR Tech Blog',
    url: 'https://tech.smarthr.jp/feed',
    domain: 'tech.smarthr.jp',
    type: 'rss'
  },
  {
    id: 'lycorp_tech_blog',
    name: 'LY Corporation Tech Blog',
    url: 'https://techblog.lycorp.co.jp/ja/feed/index.xml',
    domain: 'techblog.lycorp.co.jp',
    type: 'rss'
  },
  {
    id: 'gmo_tech_blog',
    name: 'GMO Developers',
    url: 'https://developers.gmo.jp/feed/',
    domain: 'developers.gmo.jp',
    type: 'rss'
  },
  {
    id: 'sansan_tech_blog',
    name: 'Sansan Builders Box',
    url: 'https://buildersbox.corp-sansan.com/rss',
    domain: 'buildersbox.corp-sansan.com',
    type: 'rss'
  },
  {
    id: 'mercari_tech_blog',
    name: 'Mercari Engineering',
    url: 'https://engineering.mercari.com/blog/feed.xml',
    domain: 'engineering.mercari.com',
    type: 'rss'
  },
  {
    id: 'zozo_tech_blog',
    name: 'ZOZO TECH BLOG',
    url: 'https://techblog.zozo.com/rss',
    domain: 'techblog.zozo.com',
    type: 'rss'
  },
  {
    id: 'moneyforward_tech_blog',
    name: 'Money Forward Developers Blog',
    url: 'https://moneyforward-dev.jp/rss',
    domain: 'moneyforward-dev.jp',
    type: 'rss'
  },
  {
    id: 'hatena_tech_blog',
    name: 'Hatena Developer Blog',
    url: 'https://developer.hatenastaff.com/rss',
    domain: 'developer.hatenastaff.com',
    type: 'rss'
  },
  {
    id: 'pepabo_tech_blog',
    name: 'ペパボテックブログ',
    url: 'https://tech.pepabo.com/feed/',
    domain: 'tech.pepabo.com',
    type: 'rss'
  },
  {
    id: 'cookpad_tech_blog',
    name: 'Cookpad Tech Life',
    url: 'https://techlife.cookpad.com/rss',
    domain: 'techlife.cookpad.com',
    type: 'rss'
  }
];

async function registerCorporateSources() {
  console.log('🚀 企業ブログソースの登録を開始します...');
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const source of corporateSources) {
    try {
      // 既存のソースがあるか確認
      const existing = await prisma.source.findUnique({
        where: { id: source.id }
      });
      
      if (existing) {
        console.log(`⏭️  ${source.name} は既に登録済みです`);
        skipCount++;
        continue;
      }
      
      // 新規ソースを登録
      await prisma.source.create({
        data: {
          id: source.id,
          name: source.name,
          url: source.url,
          type: source.type,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ ${source.name} を登録しました`);
      successCount++;
    } catch (error) {
      console.error(`❌ ${source.name} の登録に失敗しました:`, error);
      errorCount++;
    }
  }
  
  console.log('\n📊 登録結果:');
  console.log(`  成功: ${successCount}件`);
  console.log(`  スキップ: ${skipCount}件`);
  console.log(`  エラー: ${errorCount}件`);
  
  return { successCount, skipCount, errorCount };
}

async function main() {
  try {
    const result = await registerCorporateSources();
    
    if (result.errorCount > 0) {
      process.exit(1);
    }
    
    console.log('\n✨ 企業ブログソースの登録が完了しました');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();