import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { AccessToken, CreateTokenParams, IntrospectResult } from './types.js';

export class TokensResource {
  constructor(
    private readonly http: HttpClient,
    private readonly apiKey: string,
  ) {}

  /**
   * Exchanges the Gate API key for a short-lived access token.
   *
   * Note: This endpoint does not use the Authorization header — the API key
   * is passed in the request body per the Gate API specification.
   */
  async create(params: CreateTokenParams, options?: RequestOptions): Promise<AccessToken> {
    return this.http.post<AccessToken>('/v1/gate/tokens', {
      body: { api_key: this.apiKey, ...params },
      skipAuth: true,
      ...options,
    });
  }

  /**
   * Validates a Gate access token and returns its decoded attributes.
   */
  async introspect(accessToken: string, options?: RequestOptions): Promise<IntrospectResult> {
    return this.http.post<IntrospectResult>('/v1/gate/tokens/introspect', {
      body: { access_token: accessToken },
      ...options,
    });
  }
}
