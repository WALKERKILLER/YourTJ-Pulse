import { clientTelemetrySchema, type ClientTelemetry } from '@yourtj/contracts';

const LONG_TASK_REPORT_INTERVAL_MS = 30_000;
let lastLongTaskReportAt = 0;

export function reportClientTelemetry(telemetry: ClientTelemetry): void {
  const parsed = clientTelemetrySchema.safeParse(telemetry);
  if (!parsed.success) return;
  void fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
    keepalive: true,
  }).catch(() => undefined);
}

export function installClientTelemetry(): void {
  window.addEventListener('error', () => reportClientTelemetry({ event: 'web.crash', result: 'error' }));
  window.addEventListener('unhandledrejection', () => reportClientTelemetry({ event: 'web.unhandled-rejection', result: 'error' }));
  if (!('PerformanceObserver' in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timestamp = Date.now();
        if (timestamp - lastLongTaskReportAt < LONG_TASK_REPORT_INTERVAL_MS) continue;
        lastLongTaskReportAt = timestamp;
        reportClientTelemetry({ event: 'web.long-task', result: 'recovered', durationMs: entry.duration });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long-task observation is optional and unsupported by some browsers.
  }
}
