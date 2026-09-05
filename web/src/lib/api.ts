/**
 * Talking to the API.
 *
 * Small on purpose. There is no client-side cache, no retry and no query
 * library here yet, because none of those decisions should be made before there
 * are enough endpoints to know what they need to do.
 *
 * The one rule that is not negotiable: an amount arrives as a string and stays
 * a string. It is parsed with BigInt where arithmetic is needed and never with
 * Number, because the moment a total becomes a double it is one rounding away
 * from a payout that does not reconcile (docs/03).
 */

/** What went wrong, in words a person can act on. */
export interface ApiFailure {
  readonly kind: 'offline' | 'http' | 'malformed';
  readonly message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

interface ServerError {
  error?: { code?: string; message?: string };
}

/**
 * The API is served from the same origin, proxied by Vite in development, so a
 * relative path is correct in both places and there is no base URL to configure.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { accept: 'application/json' },
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch {
    // fetch only rejects for a transport failure. In development that almost
    // always means the API is not running, so say that rather than "failed to
    // fetch", which sends people to look in the wrong place.
    return {
      ok: false,
      error: {
        kind: 'offline',
        message: 'Cannot reach the server. Check that it is running, then try again.',
      },
    };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as ServerError;
      detail = body.error?.message ?? '';
    } catch {
      // Not our error envelope, so this reply did not come from the API.
    }

    if (detail !== '') {
      return { ok: false, error: { kind: 'http', message: detail } };
    }

    // Every error the API itself returns carries an `error.message`. A failure
    // without one came from something in front of the API: the dev proxy with
    // nothing to proxy to, or a gateway. Reporting the raw status here is what
    // the first version did, and it was actively misleading: stopping the
    // server produced "the server returned 500", which sends somebody to read
    // server logs that do not exist for a process that is not running.
    return {
      ok: false,
      error: {
        kind: 'offline',
        message:
          'No reply from the server. It may not be running. Check it, then try again.',
      },
    };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: { kind: 'malformed', message: 'The server sent a reply that could not be read.' },
    };
  }
}

export interface ApiBatch {
  readonly reference: string;
  readonly programme: string;
  readonly status: string;
  readonly items: number;
  readonly totalMinor: string;
  readonly currency: string;
  readonly preparedBy: string;
  readonly approvedBy: string | null;
  readonly updatedAt: string;
}

export interface BatchListResponse {
  readonly batches: readonly ApiBatch[];
}

export const listBatches = (signal?: AbortSignal): Promise<ApiResult<BatchListResponse>> =>
  apiGet<BatchListResponse>('/batches', signal);
