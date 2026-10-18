/** Race a promise against a timer. Resolves with the promise's value, or with
 * the TIMED_OUT sentinel when `ms` elapses first; a rejection still rejects.
 * The original promise is not cancelled — browser APIs such as
 * `Notification.requestPermission()` keep waiting, we just stop blocking the
 * UI on them. Pure — no DOM access. */
export const TIMED_OUT = Symbol("timed-out");

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
