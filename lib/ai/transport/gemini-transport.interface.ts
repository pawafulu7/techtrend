export type GeminiServiceTier = 'standard' | 'flex';

export type TransportRequest = {
  model: string;
  body: Record<string, unknown>;
  requestId: string;
  timeoutMs?: number;
  /** 'flex'指定時、Standard tierへのフォールバック付きでFlex tierを試行する。未指定時はStandard tierのみ */
  serviceTier?: GeminiServiceTier;
};

export type TransportResult = {
  status: 'ok' | 'retryable_error' | 'fatal_error';
  httpStatus?: number;
  payload?: Record<string, unknown>;
  error?: Error;
  latencyMs: number;
  headers: Record<string, string>;
  /** 最終的に使用されたtier。Flexが失敗してStandardへフォールバックした場合は'standard'になる */
  serviceTierUsed?: GeminiServiceTier;
  /** Flex tierを試行し、Standardへフォールバックが発生したか */
  fellBackToStandard?: boolean;
};

export interface GeminiTransport {
  invoke(opts: TransportRequest): Promise<TransportResult>;
  warmup?(): Promise<void>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly isRetryable: boolean,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TransportError';
  }
}
