import { HttpClient } from '../../core/http.js';
import type { RequestOptions, ServiceConfig } from '../../core/types.js';
import { IdentitiesResource } from './identities.js';
import { TokensResource } from './tokens.js';
import type { AuthorizeParams, AuthorizeResult } from './types.js';

export class Gate {
  readonly identities: IdentitiesResource;
  readonly tokens: TokensResource;

  private readonly http: HttpClient;

  constructor(config: ServiceConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.identities = new IdentitiesResource(this.http);
    this.tokens = new TokensResource(this.http, config.apiKey);
  }

  /**
   * Checks whether a given subject is allowed to perform an action on a resource.
   * This is the core building block for enforcing authorization in your services.
   *
   * @example
   * const result = await gate.authorize({
   *   subject: 'usr_123',
   *   action: 'relay.messages.read',
   *   resource: 'tenant:ten_001',
   * });
   * if (!result.allowed) throw new Error('Forbidden');
   */
  async authorize(params: AuthorizeParams, options?: RequestOptions): Promise<AuthorizeResult> {
    return this.http.post<AuthorizeResult>('/v1/gate/authorize', { body: params, ...options });
  }
}
