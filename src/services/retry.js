// Exponential backoff with jitter — the same scheme Mirai's client uses when a
// translation fails: wait 1 s, then 2 s, 4 s … (capped), plus a little random
// extra so many clients don't all retry at the same instant.
// Only errors marked `retryable` are retried; anything else fails right away.
export async function withRetry(
  task,
  { attempts = 5, baseDelayMs = 1000, multiplier = 2, maxDelayMs = 30_000, maxJitterMs = 500, onRetry } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      if (!error?.retryable || attempt >= attempts) throw error;
      const delay = Math.min(baseDelayMs * multiplier ** (attempt - 1), maxDelayMs) + Math.random() * maxJitterMs;
      onRetry?.({ attempt, delay, error });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
