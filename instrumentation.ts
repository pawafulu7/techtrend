import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
import {
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';

const baseEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

const normalize = (url: string, path: string) =>
  `${url.replace(/\/$/, '')}${path}`;

const parseRatio = () => {
  const raw = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? '1');
  if (Number.isNaN(raw)) {
    console.warn('[otel]', 'Invalid OTEL_TRACES_SAMPLER_ARG; falling back to 1.0');
    return 1;
  }

  return Math.min(Math.max(raw, 0), 1);
};

const ratio = parseRatio();
const logNamespace = '[otel]';
const otelDisabled = process.env.OTEL_SDK_DISABLED === 'true';

const parseHeaders = () => {
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    console.warn(logNamespace, 'Failed to parse OTEL_EXPORTER_OTLP_HEADERS; ignoring value', {
      error,
    });
    return undefined;
  }
};

const selectRootSampler = () =>
  ratio >= 1
    ? new AlwaysOnSampler()
    : new TraceIdRatioBasedSampler(ratio);

export function register() {
  if (otelDisabled) {
    console.log(logNamespace, 'OTEL_SDK_DISABLED is true; skipping OpenTelemetry SDK registration');
    return;
  }

  const traceExporter = new OTLPHttpJsonTraceExporter({
    url: normalize(baseEndpoint, '/v1/traces'),
    headers: parseHeaders(),
  });

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'techtrend-dev',
    traceExporter,
    traceSampler: new ParentBasedSampler({
      root: selectRootSampler(),
    }),
  });
}
