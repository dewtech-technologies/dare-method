/**
 * Run an async operation with a hard timeout, backed by `AbortController`.
 *
 * The operation receives the controller's `signal` — adapters MUST forward
 * it to their underlying SDK call (Anthropic, Cursor, Google) so an external
 * abort is honored. If the SDK doesn't support cancellation, we still time
 * out at the JS level via the racing promise.
 *
 * Also accepts an optional `externalSignal` so a SIGINT/SIGTERM listener can
 * cancel everything in flight.
 */

export interface WithTimeoutOptions {
  timeoutSeconds: number;
  externalSignal?: AbortSignal;
}

export interface TimeoutContext {
  signal: AbortSignal;
}

export class TaskTimeoutError extends Error {
  constructor(public readonly timeoutSeconds: number) {
    super(`Task exceeded ${timeoutSeconds}s timeout`);
    this.name = 'TaskTimeoutError';
  }
}

export class TaskAbortedError extends Error {
  constructor(reason = 'aborted') {
    super(`Task aborted: ${reason}`);
    this.name = 'TaskAbortedError';
  }
}

export async function withTimeout<T>(
  op: (ctx: TimeoutContext) => Promise<T>,
  { timeoutSeconds, externalSignal }: WithTimeoutOptions,
): Promise<T> {
  const controller = new AbortController();

  // Forward external aborts (e.g. SIGINT handler) to our controller.
  const onExternal = (): void => controller.abort('external');
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external');
    else externalSignal.addEventListener('abort', onExternal, { once: true });
  }

  const timer = setTimeout(() => controller.abort('timeout'), timeoutSeconds * 1000);

  try {
    return await Promise.race([
      op({ signal: controller.signal }),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          const reason = (controller.signal.reason as string | undefined) ?? 'aborted';
          reject(reason === 'timeout'
            ? new TaskTimeoutError(timeoutSeconds)
            : new TaskAbortedError(String(reason)));
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternal);
  }
}
