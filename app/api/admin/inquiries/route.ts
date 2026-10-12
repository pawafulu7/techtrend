/**
 * Admin Inquiries API - 問い合わせの一覧
 *
 * GET /api/admin/inquiries - 状況で絞り込み、新しい順にページ番号方式で返す。状況別の件数つき
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import logger from '@/lib/logger';
import { ValidationError, formatErrorResponse } from '@/lib/errors';
import { firstIssue, listInquiriesQuerySchema } from '@/lib/inquiries/schema';
import {
  INQUIRY_LIST_SELECT,
  toInquiryListItem,
} from '@/lib/inquiries/serialize';
import type {
  AdminInquiriesResponse,
  InquiryCounts,
} from '@/app/admin/inquiries/_types';

export const dynamic = 'force-dynamic';

// 本文と返信先を含むので、共有のキャッシュにもブラウザのキャッシュにも残さない
const NO_STORE = 'private, no-cache, no-store, must-revalidate';

async function handler(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = listInquiriesQuerySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    perPage: searchParams.get('perPage') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    const { field, message } = firstIssue(parsed.error);
    return NextResponse.json(
      formatErrorResponse(new ValidationError(message, field)),
      { status: 400 }
    );
  }

  const { page, perPage, status } = parsed.data;
  const where: Prisma.InquiryWhereInput = status ? { status } : {};

  try {
    // 一覧の行と件数を同じ時点のデータから取る（間に送信や状況の変更が入っても食い違わない）
    const [rows, groups] = await prisma.$transaction(
      (tx) =>
        Promise.all([
          tx.inquiry.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * perPage,
            take: perPage,
            select: INQUIRY_LIST_SELECT,
          }),
          tx.inquiry.groupBy({
            by: ['status'],
            _count: { _all: true },
            orderBy: { status: 'asc' },
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );

    // groupBy は行の無い状況を返さないので 0 で埋める
    const counts: InquiryCounts = {
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      all: 0,
    };
    for (const group of groups) {
      counts[group.status] = group._count._all;
      counts.all += group._count._all;
    }
    const total = status ? counts[status] : counts.all;

    const response: AdminInquiriesResponse = {
      data: rows.map(toInquiryListItem),
      pagination: {
        page,
        limit: perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      },
      counts,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': NO_STORE },
    });
  } catch (error) {
    const err = error as { name?: string; code?: string };
    logger.error(
      { errorName: err?.name, errorCode: err?.code },
      '[AdminInquiriesAPI] Failed to fetch inquiries'
    );
    return NextResponse.json(
      { error: 'Failed to fetch inquiries' },
      { status: 500, headers: { 'Cache-Control': NO_STORE } }
    );
  }
}

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
