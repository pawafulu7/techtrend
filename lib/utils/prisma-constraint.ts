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
  /** 違反が起きたモデル・テーブル（例: 'Article'）。分からなければ undefined */
  model?: string;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'string' && v.length > 0)
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toConstraint(value: unknown): PrismaErrorConstraint | undefined {
  const index = nonEmptyString(value);
  if (index) return { index };
  if (isNonEmptyStringArray(value)) return { fields: value };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const { fields, index } = value as { fields?: unknown; index?: unknown };
    const constraint: PrismaErrorConstraint = {};
    if (isNonEmptyStringArray(fields)) constraint.fields = fields;
    const indexName = nonEmptyString(index);
    if (indexName) constraint.index = indexName;
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

  const { target, field_name, constraint, driverAdapterError, modelName } =
    meta as {
      target?: unknown;
      field_name?: unknown;
      constraint?: unknown;
      modelName?: unknown;
      driverAdapterError?: { cause?: { constraint?: unknown; table?: unknown } };
    };

  const found =
    toConstraint(driverAdapterError?.cause?.constraint) ??
    toConstraint(target) ??
    toConstraint(field_name) ??
    toConstraint(constraint);
  if (!found) return undefined;

  const model =
    nonEmptyString(modelName) ?? nonEmptyString(driverAdapterError?.cause?.table);
  return model ? { ...found, model } : found;
}

/**
 * 制約を、ログに載せる1つの文字列にする（列名があれば列名、なければ制約名）。
 * 制約名は内部のスキーマを表すので、API のレスポンスには getPrismaErrorFields を使う。
 */
export function describePrismaErrorConstraint(
  error: unknown
): string | undefined {
  const constraint = getPrismaErrorConstraint(error);
  return constraint?.fields?.join(', ') ?? constraint?.index;
}

/** 違反した列名（API のレスポンスに載せる用）。列名が分からなければ undefined */
export function getPrismaErrorFields(error: unknown): string | undefined {
  return getPrismaErrorConstraint(error)?.fields?.join(', ');
}

/**
 * `model.field` 単独の一意制約（`@unique`）違反かを判定する。
 * 制約名は Prisma の既定の命名 `{Model}_{field}_key` で照合する。
 * 列名で照合するときは、複合の一意制約や別モデルの同名の列を区別する。
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
  if (constraint.model !== undefined && constraint.model !== model) return false;
  if (constraint.index !== undefined) {
    return constraint.index === `${model}_${field}_key`;
  }
  return constraint.fields?.length === 1 && constraint.fields[0] === field;
}
