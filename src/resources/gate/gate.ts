import { HttpClient } from '../../core/http.js';
import type { RequestOptions, ServiceConfig } from '../../core/types.js';
import { IdentitiesResource } from './identities.js';
import { SettingsResource } from './settings.js';
import { TokensResource } from './tokens.js';
import type { AuthorizeParams, AuthorizeResult, LoginFlow } from './types.js';

export class Gate {
  readonly identities: IdentitiesResource;
  readonly tokens: TokensResource;
  readonly settings: SettingsResource;

  private readonly http: HttpClient;

  constructor(config: ServiceConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.identities = new IdentitiesResource(this.http);
    this.tokens = new TokensResource(this.http, config.apiKey);
    this.settings = new SettingsResource(this.http);
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

  /**
   * Returns the list of social login providers currently enabled for a tenant.
   * This is a public, unauthenticated endpoint — call it from your login /
   * registration page to decide which social buttons to render.
   *
   * @example
   * const providers = await gate.getEnabledProviders('ten_001');
   * // → ['github', 'google']
   */
  async getEnabledProviders(tenantId: string, options?: RequestOptions): Promise<string[]> {
    const res = await this.http.get<{ providers: string[] }>(
      `/public/gate/providers/${encodeURIComponent(tenantId)}`,
      { skipAuth: true, ...options },
    );
    return res.providers;
  }

  /**
   * Initializes a Kratos login flow using your Gate API key. Call this from
   * your server and pass the returned flow JSON to your browser-side code to
   * render social login buttons. The flow already contains only the providers
   * your tenant has enabled.
   *
   * @example
   * const flow = await gate.createLoginFlow();
   * // send `flow` to the browser as JSON
   */
  async createLoginFlow(options?: RequestOptions): Promise<LoginFlow> {
    return this.http.get<LoginFlow>('/v1/gate/auth/login', options);
  }
}
