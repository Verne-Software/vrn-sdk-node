import { VerneAPIError, VerneError, type APIErrorBody } from './errors.js';
import type { RequestOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.vernesoft.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface HttpClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface HttpRequestOptions extends RequestOptions {
  /** When true, omit the Authorization header (used by gate.tokens.create). */
  skipAuth?: boolean;
  /** Body to send as JSON. */
  body?: unknown;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
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
    const { skipAuth, body, signal, headers: extraHeaders, timeoutMs } = options;

    const url = `${this.baseUrl}${path}`;
    const timeout = timeoutMs ?? this.timeoutMs;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (!skipAuth) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
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

    // Retry on 429 with Retry-After header (only one retry, only for send-type requests)
    if (response.status === 429 && attempt === 1 && method === 'POST') {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 1000;
      await sleep(waitMs);
      return this.request<T>(method, path, options, 2);
    }

    if (!response.ok) {
      let errorBody: APIErrorBody;
      try {
        errorBody = (await response.json()) as APIErrorBody;
      } catch {
        throw new VerneError(`HTTP ${response.status}: ${method} ${path}`);
      }
      throw VerneAPIError.fromResponse(response.status, errorBody);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
