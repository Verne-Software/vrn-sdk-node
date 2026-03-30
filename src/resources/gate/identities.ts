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
}
