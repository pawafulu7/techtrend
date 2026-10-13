/**
 * Prisma の制約違反エラー（P2002 / P2003）から、違反した制約を取り出す。
 *
 * Prisma 7 のドライバーアダプタ（@prisma/adapter-pg）経由では、制約の情報は
 * `meta.target` / `meta.field_name` ではなく `meta.driverAdapterError.cause.constraint`
 * に入る。さらに 7.10 からは一意制約違反でも列名（fields）より制約名（index）が優先される。
 * どの形でも読めるようにここで吸収する。
 */

export interface PrismaErrorConstraint {
  /** 違反した列名（例: ['url']） */
  fields?: string[];
  /** 違反した制約・インデックス名（例: 'Article_url_key'） */
  index?: string;
}

function toConstraint(value: unknown): PrismaErrorConstraint | undefined {
  if (typeof value === 'string' && value.length > 0) return { index: value };
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return { fields: value };
  }
  if (typeof value === 'object' && value !== null) {
    const { fields, index } = value as { fields?: unknown; index?: unknown };
    const constraint: PrismaErrorConstraint = {};
    if (Array.isArray(fields) && fields.every((v) => typeof v === 'string')) {
      constraint.fields = fields;
    }
    if (typeof index === 'string' && index.length > 0) constraint.index = index;
    if (constraint.fields || constraint.index) return constraint;
  }
  return undefined;
}

export function getPrismaErrorConstraint(
  error: unknown
): PrismaErrorConstraint | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return undefined;

  const { target, field_name, constraint, driverAdapterError } = meta as {
    target?: unknown;
    field_name?: unknown;
    constraint?: unknown;
    driverAdapterError?: { cause?: { constraint?: unknown } };
  };

  return (
    toConstraint(driverAdapterError?.cause?.constraint) ??
    toConstraint(target) ??
    toConstraint(field_name) ??
    toConstraint(constraint)
  );
}

/** 制約を、ログやレスポンスに載せる1つの文字列にする（列名があれば列名） */
export function describePrismaErrorConstraint(
  error: unknown
): string | undefined {
  const constraint = getPrismaErrorConstraint(error);
  return constraint?.fields?.join(', ') ?? constraint?.index;
}

/**
 * `model.field` の一意制約（`@unique`）違反かを判定する。
 * 制約名は Prisma の既定の命名 `{Model}_{field}_key` で照合する。
 */
export function isUniqueConstraintViolationOn(
  error: unknown,
  model: string,
  field: string
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code !== 'P2002') return false;
  const constraint = getPrismaErrorConstraint(error);
  if (!constraint) return false;
  return (
    constraint.fields?.includes(field) === true ||
    constraint.index === `${model}_${field}_key`
  );
}
