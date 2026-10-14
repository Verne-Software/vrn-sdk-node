import { VerneAPIError, VerneError } from './errors.js';
import type { RequestOptions } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.vernesoft.com';
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The longest `Retry-After` the client waits out on its own before retrying a `429`.
 * Anything longer — Relay's monthly limit answers with the seconds until the 1st of next
 * month — is raised at once, with `retryAfter` on the error, for the caller to decide.
 */
const MAX_AUTO_RETRY_AFTER_SECONDS = 60;

/** A `429` that waiting a few seconds does not lift. */
const NON_RETRYABLE_429_CODES = new Set(['RELAY_MESSAGE_LIMIT_REACHED']);

export interface HttpClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface HttpRequestOptions extends RequestOptions {
  /** When true, omit the Authorization header (calls authenticated by something else). */
  skipAuth?: boolean;
  /** Body to send as JSON. */
  body?: unknown;
  /** Query parameters. `undefined` and `null` values are dropped. */
  query?: QueryParams;
  /** An end user's session token, sent as `X-Session-Token`. */
  sessionToken?: string;
}

export type QueryParams = Record<string, string | number | boolean | Date | null | undefined>;

export class HttpClient {
  private readonly apiKey: string;
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  async put<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  async patch<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, options);
  }

  async delete<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(
    method: string,
    path: string,
    options: HttpRequestOptions = {},
    attempt = 1,
  ): Promise<T> {
    const {
      skipAuth,
      body,
      signal,
      headers: extraHeaders,
      timeoutMs,
      query,
      sessionToken,
    } = options;

    const qs = buildQuery(query);
    const url = `${this.baseUrl}${path}${qs ? (path.includes('?') ? '&' : '?') + qs : ''}`;
    const timeout = timeoutMs ?? this.timeoutMs;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    };

    if (!skipAuth) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (sessionToken !== undefined) {
      headers['X-Session-Token'] = sessionToken;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Allow external signal to also abort the request
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combinedSignal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new VerneError(`Request timed out after ${timeout}ms: ${method} ${path}`);
      }
      throw new VerneError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        throw VerneAPIError.fromResponse(response.status, undefined, retryAfter);
      }
      const error = VerneAPIError.fromResponse(response.status, errorBody, retryAfter);

      // One retry of a POST on a short 429 (the per-minute burst ceilings). Never on a
      // limit that lifts at the end of the month, and never on a 402.
      const wait = retryAfter ?? 1;
      if (
        response.status === 429 &&
        attempt === 1 &&
        method === 'POST' &&
        wait <= MAX_AUTO_RETRY_AFTER_SECONDS &&
        !NON_RETRYABLE_429_CODES.has(error.code)
      ) {
        await sleep(wait * 1000);
        return this.request<T>(method, path, options, 2);
      }
      throw error;
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/** Seconds from a `Retry-After` header (delta-seconds or an HTTP date), or undefined. */
function parseRetryAfter(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(raw);
  if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  return undefined;
}

/** `a=1&b=2` from a params object; `undefined`/`null` dropped, a `Date` as RFC 3339. */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  return search.toString();
}

/** One path segment, URL-encoded: ids come from callers and must not reshape the path. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
