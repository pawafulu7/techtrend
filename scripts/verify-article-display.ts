/**
 * 問題記事の表示確認スクリプト
 */

import { PrismaClient } from '@prisma/client';
import { parseSummary } from '../lib/utils/summary-parser';

const prisma = new PrismaClient();

async function verifyArticleDisplay() {
  try {
    // 問題の記事を取得
    const article = await prisma.article.findUnique({
      where: { id: 'cmecjm8da001ntet78dt8nw20' }
    });

    if (!article) {
      console.log('記事が見つかりません');
      return;
    }

    console.log('=== 記事情報 ===');
    console.log('ID:', article.id);
    console.log('タイトル:', article.title);
    console.log('summaryVersion:', article.summaryVersion);
    console.log();

    // 詳細要約をパース
    const sections = parseSummary(article.detailedSummary || '', { 
      summaryVersion: article.summaryVersion || undefined 
    });

    console.log('=== パース結果 ===');
    console.log('セクション数:', sections.length);
    console.log();

    // 「詳細」というデフォルトタイトルがあるか確認
    const defaultSections = sections.filter(s => s.title === '詳細');
    console.log('「詳細」タイトルのセクション数:', defaultSections.length);
    
    if (defaultSections.length > 0) {
      console.log('⚠️ 問題: デフォルトタイトル「詳細」が存在します');
    } else {
      console.log('✅ 正常: デフォルトタイトル「詳細」は存在しません');
    }
    console.log();

    // 各セクションの詳細を表示
    console.log('=== セクション詳細 ===');
    sections.forEach((section, index) => {
      console.log(`\n[セクション ${index + 1}]`);
      console.log('タイトル:', section.title);
      console.log('アイコン:', section.icon);
      
      // サブ項目が改行されているか確認
      const lines = section.content.split('\n');
      if (lines.length > 1) {
        console.log('コンテンツ: (複数行 - サブ項目あり)');
        lines.forEach((line, i) => {
          console.log(`  行${i + 1}: ${line.substring(0, 50)}...`);
        });
      } else {
        console.log('コンテンツ:', section.content.substring(0, 100) + '...');
      }
    });

    console.log('\n=== 表示シミュレーション ===');
    sections.forEach((section) => {
      console.log(`\n【${section.icon} ${section.title}】`);
      const lines = section.content.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) console.log(''); // 改行（mt-2相当）
        console.log(`  ${line}`);
      });
    });

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyArticleDisplay();