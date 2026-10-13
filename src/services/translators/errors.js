// Every translator throws this, so the retry logic and the UI only need to
// understand one error shape. `code: 'unavailable'` means the engine can't be
// used right now (not running, not set up, daily limit reached), so the next
// engine in line should translate instead.
export class TranslationError extends Error {
  constructor(message, { retryable = false, code, cause } = {}) {
    super(message, { cause });
    this.name = 'TranslationError';
    this.retryable = retryable;
    this.code = code;
  }
}
