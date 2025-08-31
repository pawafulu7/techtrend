import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date } = body;

    const generator = new DigestGenerator(prisma);
    const digestId = await generator.generateWeeklyDigest(
      date ? new Date(date) : undefined
    );

    return NextResponse.json({ 
      success: true, 
      digestId 
    });
  } catch (error) {
    console.error('Failed to generate digest:', error);
    return NextResponse.json(
      { error: 'Failed to generate digest' },
      { status: 500 }
    );
  }
}