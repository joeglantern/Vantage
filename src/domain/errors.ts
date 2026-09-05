/**
 * The typed error taxonomy from docs/09. Strings are not a taxonomy: the whole
 * point of these classes is that `IndeterminateError` cannot be caught by the
 * same handler as `GatewayError`.
 */

/** An invariant was violated. Safe to show a client; maps to 4xx. */
export class DomainError extends Error {
  override readonly name = 'DomainError';
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Bad input, with enough detail to point at the field. */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

/** 403. Deliberately vague to the client; the detail goes to the audit log. */
export class AuthorisationError extends Error {
  override readonly name = 'AuthorisationError';
  constructor(message = 'Not permitted') {
    super(message);
  }
}

/**
 * Daraja returned something explicit and unhappy. `retryable` is set only when
 * the failure code is unambiguous, and even then retry is a human action.
 */
export class GatewayError extends Error {
  override readonly name = 'GatewayError';
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * We do not know whether the money moved.
 *
 * This exists as its own type precisely so that generic retry logic cannot
 * swallow it. If this is ever handled by the same `catch` as GatewayError, that
 * is a bug. See docs/09. A timeout is probed, never retried.
 */
export class IndeterminateError extends Error {
  override readonly name = 'IndeterminateError';
  /** Never retryable. Not a setting; a fact about this error. */
  readonly retryable = false as const;
  constructor(
    message: string,
    readonly originatorConversationId: string,
  ) {
    super(message);
  }
}

/**
 * The process is misconfigured and must not start.
 *
 * Separate from ValidationError because the audience is different: nobody using
 * the product can act on this, and it must never reach an HTTP response. It is
 * for whoever is deploying, and it is fatal by design (docs/09).
 */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  constructor(message: string) {
    super(message);
  }
}
