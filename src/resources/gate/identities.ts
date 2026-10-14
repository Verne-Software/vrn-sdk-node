import { seg } from '../../core/http.js';
import type { HttpClient } from '../../core/http.js';
import type { ListParams, Paginated, RequestOptions } from '../../core/types.js';
import type { CreateIdentityParams, Identity, JsonPatchOp, OrgClaim } from './types.js';

export class IdentitiesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a new identity (end user) bound to your tenant. Answers `201`.
   *
   * A `409 conflict` means you already have an end user with this address; the same
   * address at another tenant is a different person and does not conflict. Traits are
   * `email` and `locale` only — keep your own fields in custom metadata.
   */
  async create(params: CreateIdentityParams, options?: RequestOptions): Promise<Identity> {
    return this.http.post<Identity>('/v1/gate/identities', { body: params, ...options });
  }

  /**
   * Returns an identity by ID. An identity of another tenant is refused.
   */
  async get(identityId: string, options?: RequestOptions): Promise<Identity> {
    return this.http.get<Identity>(`/v1/gate/identities/${seg(identityId)}`, options);
  }

  /**
   * Partially updates an identity using a JSON Patch document (RFC 6902).
   *
   * @example
   * await gate.identities.patch('identity_123', [
   *   { op: 'replace', path: '/traits/email', value: 'new@example.com' },
   * ]);
   */
  async patch(identityId: string, ops: JsonPatchOp[], options?: RequestOptions): Promise<Identity> {
    return this.http.patch<Identity>(`/v1/gate/identities/${seg(identityId)}`, {
      body: ops,
      ...options,
    });
  }

  /**
   * Deletes an identity, its sessions and its memberships. Fires `identity.deleted`.
   */
  async delete(identityId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/gate/identities/${seg(identityId)}`, options);
  }

  /**
   * Activates or deactivates an identity. An `inactive` identity cannot sign in, its
   * sessions stop working (until it is active again), its access tokens introspect as
   * `active: false`, and no signed token is issued for it. Nothing is deleted. Fires the
   * `identity.state_changed` webhook event.
   *
   * @example
   * await gate.identities.setState('identity_123', 'inactive');
   */
  async setState(
    identityId: string,
    state: 'active' | 'inactive',
    options?: RequestOptions,
  ): Promise<Identity> {
    return this.http.patch<Identity>(`/v1/gate/identities/${seg(identityId)}/state`, {
      body: { state },
      ...options,
    });
  }

  /** Convenience wrapper for {@link setState}(identityId, 'active'). */
  async activate(identityId: string, options?: RequestOptions): Promise<Identity> {
    return this.setState(identityId, 'active', options);
  }

  /** Convenience wrapper for {@link setState}(identityId, 'inactive'). */
  async deactivate(identityId: string, options?: RequestOptions): Promise<Identity> {
    return this.setState(identityId, 'inactive', options);
  }

  /**
   * Triggers a new email verification flow for an identity — useful when the
   * original verification email expired or was never received. The user receives
   * a fresh verification email. Resolves on `204 No Content`.
   */
  async resendVerification(identityId: string, options?: RequestOptions): Promise<void> {
    return this.http.post<void>(
      `/v1/gate/identities/${seg(identityId)}/resend-verification`,
      options,
    );
  }

  /**
   * Reads an identity's custom metadata (`metadata_public`) — the place for your own
   * fields about a user. `{}` when nothing is set.
   */
  async getMetadata(
    identityId: string,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    const res = await this.http.get<{ metadata_public: Record<string, unknown> }>(
      `/v1/gate/identities/${seg(identityId)}/metadata`,
      options,
    );
    return res.metadata_public;
  }

  /**
   * Merges `patch` into an identity's custom metadata and returns the result. Keys you
   * leave out are kept; a key set to `null` is removed.
   *
   * @example
   * await gate.identities.updateMetadata(id, { plan: 'pro', seats: null });
   */
  async updateMetadata(
    identityId: string,
    patch: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    const res = await this.http.patch<{ metadata_public: Record<string, unknown> }>(
      `/v1/gate/identities/${seg(identityId)}/metadata`,
      { body: patch, ...options },
    );
    return res.metadata_public;
  }

  /**
   * The organizations of the key's project that an end user belongs to, with the role
   * held in each and its permissions — live, oldest membership first, cursor-paged. This
   * is the complete list that `orgs_truncated: true` (in a token, an introspection or a
   * session check) points to.
   */
  async listOrganizations(
    identityId: string,
    params?: ListParams,
    options?: RequestOptions,
  ): Promise<Paginated<OrgClaim>> {
    return this.http.get<Paginated<OrgClaim>>(
      `/v1/gate/identities/${seg(identityId)}/organizations`,
      { query: { limit: params?.limit, cursor: params?.cursor }, ...options },
    );
  }
}
