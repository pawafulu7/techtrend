/**
 * 問い合わせ API の入力検証（サーバーだけで使う）
 *
 * zod をクライアントのバンドルに載せないため、定数（constants.ts）とは分けている。
 * 文言は送信画面にそのまま出ることがあるので日本語で書く。
 */
import { z } from 'zod';
import {
  INQUIRY_CATEGORIES,
  INQUIRY_EMAIL_MAX_LENGTH,
  INQUIRY_MESSAGE_MAX_LENGTH,
  INQUIRY_STATUSES,
} from './constants';
import { normalizeInquiryMessage } from './normalize';

export const createInquirySchema = z
  .object({
    category: z.enum(INQUIRY_CATEGORIES, {
      errorMap: () => ({ message: '種別を選んでください' }),
    }),
    message: z
      .string({
        required_error: '内容を書いてください',
        invalid_type_error: '内容を書いてください',
      })
      .transform(normalizeInquiryMessage)
      .pipe(
        z
          .string()
          .min(1, '内容を書いてください')
          .max(
            INQUIRY_MESSAGE_MAX_LENGTH,
            `${INQUIRY_MESSAGE_MAX_LENGTH} 文字以内で書いてください`
          )
      ),
    // 空文字は未入力として扱う
    contactEmail: z.preprocess(
      (value) => {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
      },
      z
        .string({
          invalid_type_error: 'メールアドレスの形式を確かめてください',
        })
        .max(INQUIRY_EMAIL_MAX_LENGTH, 'メールアドレスの形式を確かめてください')
        .email('メールアドレスの形式を確かめてください')
        .optional()
    ),
    // bot 避けの隠し項目。型が違っても 400 と 201 で見分けられないよう、値は問わない
    website: z.unknown().optional(),
  })
  .strict('送信できない項目が含まれています');

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

export const listInquiriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(INQUIRY_STATUSES).optional(),
});

export const updateInquirySchema = z
  .object({
    status: z.enum(INQUIRY_STATUSES),
  })
  .strict();

export const inquiryIdSchema = z.string().cuid();

/** 最初の不正な項目の名前と文言（ValidationError に渡す） */
export function firstIssue(error: z.ZodError): {
  field: string | undefined;
  message: string;
} {
  const issue = error.issues[0];
  const head = issue?.path[0];
  return {
    field: typeof head === 'string' ? head : undefined,
    message: issue?.message ?? '入力を確かめてください',
  };
}
