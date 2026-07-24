import { HttpClient } from '../../core/http.js';
import type { RequestOptions, ServiceConfig } from '../../core/types.js';
import type { LoginStart, LoginStatus, TokenIntrospection } from './types.js';

/**
 * Verne Passepartout — Telegram Auth-as-a-Service.
 *
 * Lets your end-users sign in with Telegram: start a login to get a deep link,
 * send the user to it, then poll for completion to receive an access token.
 */
export class Passepartout {
  private readonly http: HttpClient;

  constructor(config: ServiceConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
  }

  /**
   * Starts a Telegram login and returns a nonce + deep link. Send the user to
   * `deep_link`, then poll {@link loginStatus} with `nonce` until it completes.
   *
   * @example
   * const { nonce, deep_link } = await passepartout.loginStart();
   * // redirect the user to `deep_link`, then poll:
   * const status = await passepartout.loginStatus(nonce);
   */
  async loginStart(options?: RequestOptions): Promise<LoginStart> {
    return this.http.post<LoginStart>('/v1/passepartout/login/start', options);
  }

  /**
   * Returns the current state of a login attempt. While the user hasn't
   * finished, `status` is `pending`; once done it becomes `completed` and
   * carries the `access_token` and `user`.
   */
  async loginStatus(nonce: string, options?: RequestOptions): Promise<LoginStatus> {
    return this.http.get<LoginStatus>(
      `/v1/passepartout/login/status?nonce=${encodeURIComponent(nonce)}`,
      options,
    );
  }

  /**
   * Validates a Passepartout access token and returns its attributes.
   * Tokens owned by another tenant are reported as `{ active: false }`.
   */
  async introspect(accessToken: string, options?: RequestOptions): Promise<TokenIntrospection> {
    return this.http.post<TokenIntrospection>('/v1/passepartout/tokens/introspect', {
      body: { access_token: accessToken },
      ...options,
    });
  }
}
