/**
 * How a thrown error becomes a response.
 *
 * The taxonomy in src/domain/errors exists so that handlers can tell failures
 * apart. This is the one place that decision is made, because an error mapped
 * ad hoc in a route is an error that leaks something eventually.
 *
 * Two rules. Nothing derived from an exception message reaches the client
 * unless the error class is one whose messages are written for a reader:
 * anything else becomes a flat 500 with a correlation id, and the detail goes
 * to the log. And an IndeterminateError is never a 500, because `unknown` is a
 * real outcome in this domain rather than a crash (docs/04).
 */
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthorisationError,
  ConfigError,
  DomainError,
  GatewayError,
  IndeterminateError,
  ValidationError,
} from '@domain/errors';

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly field?: string;
    /** Present on 5xx so a person reporting a fault can quote something useful. */
    readonly requestId?: string;
  };
}

interface Mapped {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  /** Whether this deserves an error-level log line rather than a warning. */
  readonly serious: boolean;
}

function classify(error: unknown): Mapped {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      code: 'validation_failed',
      message: error.message,
      field: error.field,
      serious: false,
    };
  }

  if (error instanceof DomainError) {
    return { status: 409, code: error.code, message: error.message, serious: false };
  }

  if (error instanceof AuthorisationError) {
    // Deliberately vague. The detail belongs in the audit log, not in a reply
    // that tells somebody probing exactly which door they are at (docs/05).
    return { status: 403, code: 'not_permitted', message: 'Not permitted', serious: false };
  }

  if (error instanceof IndeterminateError) {
    // 503 rather than 500: the request did not fail, its outcome is not known
    // yet. Anything retrying on this must probe rather than resend, which is
    // the single most important rule in the payout lifecycle.
    return {
      status: 503,
      code: 'indeterminate',
      message: 'The outcome of this operation is not yet known. It is being resolved; do not retry.',
      serious: true,
    };
  }

  if (error instanceof GatewayError) {
    return {
      status: 502,
      code: 'gateway_error',
      message: 'The payment gateway rejected the request.',
      serious: true,
    };
  }

  if (error instanceof ConfigError) {
    // Should be impossible: configuration is validated before the server binds
    // a port. If one reaches a request it is a programming error, and its
    // message may name environment variables, so it never goes to a client.
    return {
      status: 500,
      code: 'internal_error',
      message: 'Something went wrong.',
      serious: true,
    };
  }

  const fastifyError = error as FastifyError;
  if (typeof fastifyError?.statusCode === 'number' && fastifyError.statusCode < 500) {
    // Schema validation and routing faults raised by Fastify itself. These are
    // safe to pass through: they describe the request, not the internals.
    return {
      status: fastifyError.statusCode,
      code: fastifyError.code ?? 'bad_request',
      message: fastifyError.message,
      serious: false,
    };
  }

  return { status: 500, code: 'internal_error', message: 'Something went wrong.', serious: true };
}

export function errorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const mapped = classify(error);

  // The full error always goes to the log, whatever the client is told. The
  // logger's own redaction handles credentials inside the payload.
  const logLine = { err: error, code: mapped.code, status: mapped.status };
  if (mapped.serious) request.log.error(logLine, 'request failed');
  else request.log.warn(logLine, 'request rejected');

  const body: ErrorBody = {
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.field !== undefined ? { field: mapped.field } : {}),
      ...(mapped.status >= 500 ? { requestId: request.id } : {}),
    },
  };

  return reply.status(mapped.status).send(body);
}
