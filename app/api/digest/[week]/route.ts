import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: { week: string } }
) {
  try {
    const weekDate = new Date(params.week);
    
    if (isNaN(weekDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const generator = new DigestGenerator(prisma);
    const digest = await generator.getWeeklyDigest(weekDate);

    if (!digest) {
      return NextResponse.json(
        { error: 'Digest not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(digest);
  } catch (error) {
    console.error('Failed to get digest:', error);
    return NextResponse.json(
      { error: 'Failed to get digest' },
      { status: 500 }
    );
  }
}