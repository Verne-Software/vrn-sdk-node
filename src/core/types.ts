/**
 * Paginated response wrapper returned by list endpoints.
 */
export interface Paginated<T> {
  data: T[];
  has_more: boolean;
  next_cursor?: string;
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
 * Each key corresponds to a service; only provide keys for the services you use.
 */
export interface VerneConfig {
  /** API key for the Relay (Webhooks-as-a-Service) service. Format: vrn_relay_<env>_<secret> */
  relay?: string;
  /** API key for the Gate (Auth-as-a-Service) service. Format: vrn_gate_<env>_<secret> */
  gate?: string;
  /** Base URL override. Defaults to https://api.vernesoft.com */
  baseUrl?: string;
  /** Default request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * Configuration for a single-service client (Relay or Gate).
 */
export interface ServiceConfig {
  /** API key for the service. */
  apiKey: string;
  /** Base URL override. Defaults to https://api.vernesoft.com */
  baseUrl?: string;
  /** Default request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}
