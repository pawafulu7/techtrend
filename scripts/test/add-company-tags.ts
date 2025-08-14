#!/usr/bin/env node

/**
 * Corporate Tech Blog記事に企業名タグを追加するスクリプト
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// URLから企業を判定するマッピング
const urlToCompanyMap: Record<string, string> = {
  'engineering.dena.com': 'DeNA',
  'techblog.yahoo.co.jp': 'LINEヤフー',
  'techblog.lycorp.co.jp': 'LINEヤフー',
  'engineering.mercari.com': 'メルカリ',
  'developers.cyberagent.co.jp': 'CyberAgent',
  'developers.gmo.jp': 'GMO',
  'tech.smarthr.jp': 'SmartHR',
  'developers.freee.co.jp': 'freee',
  'techlife.cookpad.com': 'クックパッド',
  'techblog.zozo.com': 'ZOZO',
  'techblog.recruit.co.jp': 'リクルート',
  'developer.hatenastaff.com': 'はてなDeveloper',
  'tech.pepabo.com': 'GMOペパボ',
  'buildersbox.corp-sansan.com': 'Sansan'
};

async function addCompanyTags() {
  console.log('🏢 Corporate Tech Blog記事に企業名タグを追加します\n');

  try {
    // Corporate Tech Blogの記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: {
          name: 'Corporate Tech Blog'
        }
      },
      include: {
        tags: true
      }
    });

    console.log(`📊 対象記事数: ${articles.length}件\n`);

    const updateCounts: Record<string, number> = {};
    let updatedCount = 0;

    for (const article of articles) {
      // URLから企業を判定
      let company: string | null = null;
      for (const [domain, companyName] of Object.entries(urlToCompanyMap)) {
        if (article.url.includes(domain)) {
          company = companyName;
          break;
        }
      }

      if (!company) {
        console.log(`⚠️ 企業判定不可: ${article.url}`);
        continue;
      }

      // すでに企業タグがあるかチェック
      const hasCompanyTag = article.tags.some(tag => tag.name === company);
      
      if (!hasCompanyTag) {
        // タグを追加
        const existingTag = await prisma.tag.findUnique({
          where: { name: company }
        });

        if (existingTag) {
          // 既存のタグを使用
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: { id: existingTag.id }
              }
            }
          });
        } else {
          // 新規タグを作成して追加
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                create: { name: company }
              }
            }
          });
        }

        console.log(`✅ ${company}タグを追加: ${article.title.substring(0, 50)}...`);
        updateCounts[company] = (updateCounts[company] || 0) + 1;
        updatedCount++;
      }
    }

    console.log('\n📊 更新結果:');
    console.log('─'.repeat(60));
    for (const [company, count] of Object.entries(updateCounts).sort()) {
      console.log(`${company.padEnd(20)}: ${count}件`);
    }
    console.log('─'.repeat(60));
    console.log(`合計: ${updatedCount}件の記事にタグを追加\n`);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
addCompanyTags().catch(console.error);