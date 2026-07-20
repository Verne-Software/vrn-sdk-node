import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { CreateIdentityParams, Identity, JsonPatchOp } from './types.js';

export class IdentitiesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Creates a new identity (end-user) bound to your tenant.
   * The `traits.tenant_id` is injected automatically by the Edge Gateway.
   */
  async create(params: CreateIdentityParams, options?: RequestOptions): Promise<Identity> {
    return this.http.post<Identity>('/v1/gate/identities', { body: params, ...options });
  }

  /**
   * Returns an identity by ID.
   * The Gateway will reject the request if the identity does not belong to your tenant.
   */
  async get(identityId: string, options?: RequestOptions): Promise<Identity> {
    return this.http.get<Identity>(`/v1/gate/identities/${identityId}`, options);
  }

  /**
   * Partially updates an identity using a JSON Patch document (RFC 6902).
   *
   * @example
   * await gate.identities.patch('identity_123', [
   *   { op: 'replace', path: '/traits/custom_data/role', value: 'admin' }
   * ]);
   */
  async patch(
    identityId: string,
    ops: JsonPatchOp[],
    options?: RequestOptions,
  ): Promise<Identity> {
    return this.http.patch<Identity>(`/v1/gate/identities/${identityId}`, {
      body: ops,
      ...options,
    });
  }

  /**
   * Deletes an identity from Kratos.
   * The Gateway will reject the request if the identity does not belong to your tenant.
   */
  async delete(identityId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/gate/identities/${identityId}`, options);
  }

  /**
   * Activates or deactivates an identity. An `inactive` identity cannot log in —
   * Kratos rejects its credentials automatically — until it is reactivated.
   * The identity is not deleted. Fires the `identity.state_changed` webhook event.
   *
   * @example
   * await gate.identities.setState('identity_123', 'inactive');
   */
  async setState(
    identityId: string,
    state: 'active' | 'inactive',
    options?: RequestOptions,
  ): Promise<Identity> {
    return this.http.patch<Identity>(`/v1/gate/identities/${identityId}/state`, {
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
      `/v1/gate/identities/${identityId}/resend-verification`,
      options,
    );
  }
}
