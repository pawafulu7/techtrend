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
    'cmdy3i8b70011te0y446v9z6t',
    // 第3バッチ
    'cme1ad8qc000jtehb9xk0ihuc',
    'cmdy3i8ad000zte0yag9j6giu',
    'cmdy3i89j000xte0y8rdtg2wp',
    'cmdy3i88p000vte0yiqoh3s45',
    'cmdy3i882000tte0yrrknarw0',
    'cmdy3i873000rte0ylrzs4mk5',
    'cmdy3i86f000pte0yo5qhr1aw',
    'cmdy3i85n000nte0y814cef70',
    'cmdy3i846000lte0ye7yosgg0',
    'cmdy3i82j000jte0yq6d2dcib',
    'cmdy3i81h000hte0y5vu8kwiw',
    'cmdy3i7zb000fte0ydo3bt03j',
    'cmdy3i7ym000dte0yk8dlo8ix',
    'cmdy3i7xu000bte0yzf6290kz',
    'cmdy3i7wv0009te0ygo9xkf0y',
    'cmdy3i7we0007te0yctsadkjw',
    'cmdy3i7vt0005te0y8gk1pls5',
    'cmdy3i7v30003te0yji2lg1j0',
    'cmdy3i7uc0001te0y9ix9qr4p',
    'cmdy2mj4z000lter9q03yjs63',
    'cmdy2mj48000jter9ju85ugpr',
    'cmdy2mj3a000hter9jk0fn414',
    'cmdy2mhnr000fter9eemrewtd',
    'cmdy2mhn0000cter9wfsks1v7',
    'cmdy2mgl00009ter99iv8aw06',
    'cmdy0hcwl0005teuer9udt16h',
    // 第4バッチ
    'cmdy0hcvs0002teue0kjaclad',
    'cmdy0hcoi0009teuepxtvdvio',
    'cmdy0hcnp0007teueaezr863s',
    'cmdxyc8yj000bteoygjb03d0e',
    'cmdxyc8xd0009teoyi7fdajpg',
    'cmdxyc8wc0007teoyqufceyg3',
    'cmdxybplx0005teoykxxeqhbv',
    'cmdxw71lt0009tedljmqphhfe',
    'cmdxw71l10007tedlxdphm984',
    'cmdxw71k40005tedlvnt99aiw',
    'cmdxw6ekz0003tedlvmnbkuoo',
    'cmdxu1uf5000cte8eaqo6sauz',
    'cmdxu1udp000ate8e5f0xbvvk',
    'cmdxu1sxo0008te8ej9vawum8',
    'cmdxu1swz0005te8e2f8l3teg',
    'cmdxu1swa0002te8ele9976ss',
    'cmdxrwpq80009telqve48zwg9',
    'cmdxrwpp80007telq4cl3720d',
    'cmdxrwpnq0005telqsqzykz1v',
    'cmdxrwplv0003telqzbowu0r1',
    'cmdxrwpkt0001telqjan8y4x6',
    'cmdxprmjz0030tezpogjatbcz',
    'cmdxprmj1002ytezpj0rv5k5j',
    'cmdxprmi5002wtezpsl0a72qv'
  ];
  
  const toFix = needsFix.filter(id => !alreadyFixed.includes(id));
  console.log('残り修正必要数:', toFix.length);
  console.log('\n次の30件:');
  console.log(JSON.stringify(toFix.slice(0, 30), null, 2));
  
  await prisma.$disconnect();
}

getNextBatch().catch(console.error);