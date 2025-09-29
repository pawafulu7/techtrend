export type TransportRequest = {
  model: string;
  body: Record<string, unknown>;
  requestId: string;
  timeoutMs?: number;
};

export type TransportResult = {
  status: 'ok' | 'retryable_error' | 'fatal_error';
  httpStatus?: number;
  payload?: Record<string, unknown>;
  error?: Error;
  latencyMs: number;
  headers: Record<string, string>;
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