/**
 * Paginated response wrapper returned by list endpoints.
 *
 * Lists are cursor-paged: pass `next_cursor` back as `cursor` while `has_more` is
 * `true`. `next_cursor` is `null` (or absent) on the last page.
 */
export interface Paginated<T> {
  data: T[];
  has_more: boolean;
  next_cursor?: string | null;
}

/** Query parameters shared by every cursor-paged list. */
export interface ListParams {
  /** Items per page, 1 to 100. Defaults to 20; the server clamps values outside the range. */
  limit?: number;
  /** The `next_cursor` of the previous page. Opaque: pass it back, do not parse it. */
  cursor?: string;
}

/**
 * Per-request options that can override client defaults.
 */
export interface RequestOptions {
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Overrides the client-level default. */
  timeoutMs?: number;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
}

/**
 * Configuration for the unified Verne client.
 *
 * A Nautilus API key looks like `vrn_…` and carries a set of scopes — the APIs it may
 * call (`relay`, `gate`, `clockwork`, `passepartout`). Pass it once as `apiKey`. The
 * per-service fields are for using a *different* key for one service; they override
 * `apiKey` for that service. Keys created before scopes existed (`vrn_gate_…`,
 * `vrn_relay_…`, …) keep working for the one API they name. There is no test or live
 * mode: every key acts on your real data.
 */
export interface VerneConfig {
  /** The API key used for every service that has no key of its own below. */
  apiKey?: string;
  /** Key for Relay (Webhooks-as-a-Service), when it differs from `apiKey`. */
  relay?: string;
  /** Key for Gate (sign-in and users), when it differs from `apiKey`. */
  gate?: string;
  /** Key for Passepartout (Telegram sign-in), when it differs from `apiKey`. */
  passepartout?: string;
  /** Key for Clockwork (Cron-as-a-Service), when it differs from `apiKey`. */
  clockwork?: string;
  /** Base URL override. Defaults to https://api.vernesoft.com */
  baseUrl?: string;
  /** Default request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * Configuration for a single-service client (Relay, Gate, Passepartout or Clockwork).
 */
export interface ServiceConfig {
  /** API key (`vrn_…`) with the scope for the service. */
  apiKey: string;
  /** Base URL override. Defaults to https://api.vernesoft.com */
  baseUrl?: string;
  /** Default request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}
