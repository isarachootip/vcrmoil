import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | null = null;

export function bootstrapOpenTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    // No-op locally when endpoint is not configured
    return;
  }

  sdk = new NodeSDK({
    serviceName: 'vcrm-api',
  });

  try {
    sdk.start();
    // eslint-disable-next-line no-console
    console.log('[OpenTelemetry] SDK initialized with endpoint:', endpoint);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[OpenTelemetry] Initialization failed:', error);
  }

  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      // eslint-disable-next-line no-console
      .then(() => console.log('[OpenTelemetry] SDK shut down gracefully'))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('[OpenTelemetry] Error shutting down SDK', err));
  });
}
