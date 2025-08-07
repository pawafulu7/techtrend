#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function getNextBatch() {
  const articles = await prisma.article.findMany({
    where: {
      detailedSummary: { not: null }
    },
    select: {
      id: true,
      detailedSummary: true
    },
    orderBy: { createdAt: 'desc' },
    take: 500
  });
  
  const needsFix = [];
  for (const article of articles) {
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      if (lines.length > 0) {
        const firstLine = lines[0];
        if (!firstLine.includes('記事の主題は')) {
          needsFix.push(article.id);
        }
      }
    }
  }
  
  // 既に修正済みのIDを除外
  const alreadyFixed = [
    'cmdy920k20007tek4veqeunzh',
    'cmdy91ji70005tek4sctz3zre',
    'cmdy4rmui0003teqqxkxpqbmg',
    'cmdy4rmtl0001teqq220y9bfl',
    'cmdy3i8fl001bte0yb4siigpj',
    'cme0lf3aj004utevw7zt49faq',
    'cme0lekh3003ctevwe7f3zizc',
    'cme0leiws0032tevwu41yev39',
    'cme0lehno002rtevweenus4ct',
    'cme0lecf2001rtevwizopb3sr',
    'cme0ldxv1000vtevwbognvizu',
    'cme0ldxun000ttevw1ttxz7h3',
    'cme0ldux6000ntevwf3svtuml',
    'cmdyhmmfx000qte7lw4m7p45c',
    'cmdyhmmd9000hte7lpsgek95g',
    'cmdyhmmcf000ete7l75sa60m7',
    'cmdyhmma20005te7lc2yw6ukz',
    'cmdyhmm900002te7lffybk5hh',
    'cmdy6wuir0003temnyia03kid',
    'cmdy6wuhw0001temnabz5p5pk',
    'cmdy3i8es0019te0y5uj7h3mq',
    'cmdy3i8e00017te0yd6x7zmvn',
    'cmdy3i8d50015te0y1gi08gh9',
    'cmdy3i8ce0013te0yzd303xp3',
    'cmdy3i8b70011te0y446v9z6t'
  ];
  
  const toFix = needsFix.filter(id => !alreadyFixed.includes(id));
  console.log('残り修正必要数:', toFix.length);
  console.log('\n次の30件:');
  console.log(JSON.stringify(toFix.slice(0, 30), null, 2));
  
  await prisma.$disconnect();
}

getNextBatch().catch(console.error);