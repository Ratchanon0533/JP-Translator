// Every translator throws this, so the retry logic and the UI only need to
// understand one error shape. `code` names special cases, e.g. 'unreachable'
// when the engine can't be contacted at all.
export class TranslationError extends Error {
  constructor(message, { retryable = false, code, cause } = {}) {
    super(message, { cause });
    this.name = 'TranslationError';
    this.retryable = retryable;
    this.code = code;
  }
}
