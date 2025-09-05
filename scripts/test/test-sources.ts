import { prisma } from '@/lib/prisma';

async function testSources() {
  try {
    const sources = await prisma.source.findMany({
      where: { 
        name: { 
          in: ['GitHub Blog', 'Cloudflare Blog', 'Mozilla Hacks'] 
        } 
      },
      select: { id: true, name: true, type: true, url: true }
    });
    
    console.log('Found sources:', JSON.stringify(sources, null, 2));
    
    if (sources.length === 3) {
      console.log('✅ All 3 sources exist in database');
    } else {
      console.log('⚠️ Only', sources.length, 'sources found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSources();