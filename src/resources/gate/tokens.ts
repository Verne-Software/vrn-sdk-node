import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type {
  AccessToken,
  CreateTokenParams,
  GateSession,
  IntrospectResult,
  SignedToken,
  SignedTokenClaims,
  VerifySignedOptions,
} from './types.js';
import { GateTokenVerifier } from './verifier.js';

export class TokensResource {
  private readonly verifiers = new Map<string, GateTokenVerifier>();

  constructor(private readonly http: HttpClient) {}

  /**
   * Exchanges the Gate API key for a short-lived access token (`gat_live_…`), for
   * `subject` — a user or a service account. Answers `201`.
   *
   * The key travels in the `Authorization` header like on every other call. (Until 1.4.0
   * this SDK sent it in the body without the header, which the API refuses with `401`.)
   */
  async create(params: CreateTokenParams, options?: RequestOptions): Promise<AccessToken> {
    return this.http.post<AccessToken>('/v1/gate/tokens', { body: params, ...options });
  }

  /**
   * Validates a Gate access token and returns its attributes. An unknown, expired or
   * foreign token, or one whose user you deactivated or deleted, is `{ active: false }`.
   *
   * When the subject is an end user, `orgs` lists their organizations in the key's
   * project, read at the moment you ask.
   */
  async introspect(accessToken: string, options?: RequestOptions): Promise<IntrospectResult> {
    return this.http.post<IntrospectResult>('/v1/gate/tokens/introspect', {
      body: { access_token: accessToken },
      ...options,
    });
  }

  /**
   * Gets a **signed JWT** (ES256) for a signed-in end user's session, for a platform that
   * verifies signatures instead of calling Gate (Supabase, an API gateway). The session
   * token is the credential: no API key is sent.
   *
   * The token is valid for 15 minutes and **cannot be revoked**; its `orgs` claim is as old
   * as the token. Every call mints a new one — ask again before the one you hold expires.
   * A revoked or expired session, or a deactivated user, is a `401`.
   *
   * @example
   * const { token } = await gate.tokens.createSigned(sessionToken);
   */
  async createSigned(sessionToken: string, options?: RequestOptions): Promise<SignedToken> {
    const res = await this.http.get<GateSession & { tokenized: string }>('/auth/sessions/whoami', {
      query: { tokenize_as: 'gate_jwt' },
      sessionToken,
      skipAuth: true,
      ...options,
    });
    const { tokenized, ...session } = res;
    return { token: tokenized, session: session as GateSession };
  }

  /**
   * Verifies a Gate signed token offline against your tenant's public keys (fetched once
   * and cached) and returns its claims. Throws `VerneTokenError` when the token must not
   * be trusted — wrong issuer (another tenant), bad signature, expired, any algorithm but
   * ES256. See {@link GateTokenVerifier} to verify without a Gate client.
   *
   * @example
   * const claims = await gate.tokens.verifySigned(token, { tenantId: 'your-tenant-id' });
   * claims.sub;  // the end user's id
   */
  async verifySigned(token: string, options: VerifySignedOptions): Promise<SignedTokenClaims> {
    const cacheKey = `${options.tenantId}|${options.clockToleranceSeconds ?? ''}`;
    let verifier = this.verifiers.get(cacheKey);
    if (!verifier) {
      verifier = new GateTokenVerifier({
        tenantId: options.tenantId,
        baseUrl: this.http.baseUrl,
        clockToleranceSeconds: options.clockToleranceSeconds,
      });
      this.verifiers.set(cacheKey, verifier);
    }
    return verifier.verify(token);
  }
}
