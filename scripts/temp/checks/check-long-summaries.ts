#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLongSummaries() {
  const articles = await prisma.article.findMany({
    where: { summary: { not: null } },
    select: { summary: true }
  });
  
  const over250 = articles.filter(a => a.summary && a.summary.length > 250);
  const over200 = articles.filter(a => a.summary && a.summary.length > 200);
  
  console.log(`250文字超の要約: ${over250.length}件`);
  console.log(`200文字超の要約: ${over200.length}件`);
  console.log(`200-250文字の要約: ${over200.length - over250.length}件`);
  
  await prisma.$disconnect();
}

checkLongSummaries().catch(console.error);