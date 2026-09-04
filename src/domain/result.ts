/**
 * A tiny result type. The domain layer reports failure by returning it, not by
 * throwing, so callers cannot ignore it by accident and so illegal transitions
 * are ordinary values a test can assert over.
 */
export type Ok<T> = { readonly ok: true } & T;
export type Err<E> = { readonly ok: false; readonly reason: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function err<E>(reason: E): Err<E> {
  return { ok: false, reason };
}
