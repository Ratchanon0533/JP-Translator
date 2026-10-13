// Every translator throws this, so the retry logic and the UI only need to
// understand one error shape.
export class TranslationError extends Error {
  constructor(message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'TranslationError';
    this.retryable = retryable;
  }
}
