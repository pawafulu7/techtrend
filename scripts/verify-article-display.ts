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
      console.error('記事が見つかりません');
      return;
    }

    console.error('=== 記事情報 ===');
    console.error('ID:', article.id);
    console.error('タイトル:', article.title);
    console.error('summaryVersion:', article.summaryVersion);
    console.error();

    // 詳細要約をパース
    const sections = parseSummary(article.detailedSummary || '', { 
      summaryVersion: article.summaryVersion || undefined 
    });

    console.error('=== パース結果 ===');
    console.error('セクション数:', sections.length);
    console.error();

    // 「詳細」というデフォルトタイトルがあるか確認
    const defaultSections = sections.filter(s => s.title === '詳細');
    console.error('「詳細」タイトルのセクション数:', defaultSections.length);
    
    if (defaultSections.length > 0) {
      console.error('⚠️ 問題: デフォルトタイトル「詳細」が存在します');
    } else {
      console.error('✅ 正常: デフォルトタイトル「詳細」は存在しません');
    }
    console.error();

    // 各セクションの詳細を表示
    console.error('=== セクション詳細 ===');
    sections.forEach((section, index) => {
      console.error(`\n[セクション ${index + 1}]`);
      console.error('タイトル:', section.title);
      console.error('アイコン:', section.icon);
      
      // サブ項目が改行されているか確認
      const lines = section.content.split('\n');
      if (lines.length > 1) {
        console.error('コンテンツ: (複数行 - サブ項目あり)');
        lines.forEach((line, i) => {
          console.error(`  行${i + 1}: ${line.substring(0, 50)}...`);
        });
      } else {
        console.error('コンテンツ:', section.content.substring(0, 100) + '...');
      }
    });

    console.error('\n=== 表示シミュレーション ===');
    sections.forEach((section) => {
      console.error(`\n【${section.icon} ${section.title}】`);
      const lines = section.content.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) console.error(''); // 改行（mt-2相当）
        console.error(`  ${line}`);
      });
    });

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyArticleDisplay();