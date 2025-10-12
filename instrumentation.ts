import { registerOTel } from '@vercel/otel';

const baseEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

const normalize = (url: string, path: string) =>
  `${url.replace(/\/$/, '')}${path}`;

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'techtrend-dev',
    traceExporter: {
      url: normalize(baseEndpoint, '/v1/traces'),
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
        : undefined,
    },
    metricsExporter: {
      url: normalize(baseEndpoint, '/v1/metrics'),
    },
    logExporter: {
      url: normalize(baseEndpoint, '/v1/logs'),
    },
    traceSampler: {
      type: process.env.OTEL_TRACES_SAMPLER ?? 'traceidratio',
      ratio: Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? '0.1'),
    },
  });
}
