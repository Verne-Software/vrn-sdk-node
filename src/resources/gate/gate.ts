import { HttpClient, seg } from '../../core/http.js';
import type { RequestOptions, ServiceConfig } from '../../core/types.js';
import { AuditLogResource } from './audit-log.js';
import { IdentitiesResource } from './identities.js';
import { LifecycleResource } from './lifecycle.js';
import { OrganizationsResource } from './organizations.js';
import { SessionsResource } from './sessions.js';
import { SettingsResource } from './settings.js';
import { TokensResource } from './tokens.js';
import type {
  AuthorizeParams,
  AuthorizeResult,
  LoginFlow,
  LoginFlowParams,
  OidcExchangeResult,
  RegistrationFlow,
  RegistrationFlowParams,
} from './types.js';

export class Gate {
  readonly identities: IdentitiesResource;
  readonly tokens: TokensResource;
  readonly settings: SettingsResource;
  readonly organizations: OrganizationsResource;
  readonly sessions: SessionsResource;
  readonly auditLog: AuditLogResource;
  readonly lifecycle: LifecycleResource;

  private readonly http: HttpClient;

  constructor(config: ServiceConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.identities = new IdentitiesResource(this.http);
    this.tokens = new TokensResource(this.http);
    this.settings = new SettingsResource(this.http);
    this.organizations = new OrganizationsResource(this.http);
    this.sessions = new SessionsResource(this.http);
    this.auditLog = new AuditLogResource(this.http);
    this.lifecycle = new LifecycleResource(this.http);
  }

  /**
   * Asks whether a subject may perform an action on a resource. The answer is a decision;
   * your service enforces it.
   *
   * - `resource: 'organization:<id>'` — may this end user do `action` (a permission) in
   *   that organization? `reason` is one of a fixed set and `role` is the role they hold.
   *   Prefer `gate.organizations.authorize()` / `can()`, which build the resource.
   * - any other resource — only *is `subject` one of your active end users?*; `reason` is
   *   `owned_by_tenant` (allowed), `subject_inactive`, `not_owned_by_tenant` or
   *   `not_a_known_identity`, and `message` says it in a sentence for your logs.
   *
   * @example
   * const decision = await gate.authorize({
   *   subject: userId,
   *   action: 'invoices:write',
   *   resource: `organization:${orgId}`,
   * });
   * if (!decision.allowed) throw new Error('Forbidden');
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
      `/public/gate/providers/${seg(tenantId)}`,
      { skipAuth: true, ...options },
    );
    return res.providers;
  }

  /**
   * Starts a Kratos login flow with your Gate API key and returns it; render its
   * `ui.nodes` or post credentials to its `ui.action`. With a return URL registered,
   * pass `return_to` and always a `state` for social login. A step-up (second factor) is
   * `{ aal: 'aal2', session_token }`.
   *
   * @example
   * const flow = await gate.createLoginFlow({ state: csrfBoundValue });
   */
  async createLoginFlow(params?: LoginFlowParams, options?: RequestOptions): Promise<LoginFlow> {
    return this.http.get<LoginFlow>('/v1/gate/auth/login', {
      query: { return_to: params?.return_to, state: params?.state, aal: params?.aal },
      sessionToken: params?.session_token,
      ...options,
    });
  }

  /**
   * Starts a Kratos registration flow. Refused with `402 ACTIVE_USER_LIMIT_REACHED` when
   * the account is past its active-user limit and the month to move up has ended.
   */
  async createRegistrationFlow(
    params?: RegistrationFlowParams,
    options?: RequestOptions,
  ): Promise<RegistrationFlow> {
    return this.http.get<RegistrationFlow>('/v1/gate/auth/registration', {
      query: { return_to: params?.return_to, state: params?.state },
      ...options,
    });
  }

  /**
   * Exchanges the one-time `code` your return URL received after a social login for the
   * user's session. The code works once, for about 60 seconds, and only with a key of the
   * project that started the login (otherwise `404`). Keep the session token server-side.
   */
  async exchangeOidcCode(code: string, options?: RequestOptions): Promise<OidcExchangeResult> {
    return this.http.post<OidcExchangeResult>('/v1/gate/auth/oidc/exchange', {
      body: { code },
      ...options,
    });
  }
}
