import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { OidcProvider, SecuritySettings } from './types.js';

export class SettingsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Returns the tenant's security settings (passwordless / MFA).
   */
  async getSecurity(options?: RequestOptions): Promise<SecuritySettings> {
    return this.http.get<SecuritySettings>('/v1/gate/settings/security', options);
  }

  /**
   * Replaces the tenant's security settings. Both fields are required — the
   * update is a full replacement, not a merge.
   *
   * @example
   * await gate.settings.updateSecurity({ passwordless_enabled: true, mfa_enabled: false });
   */
  async updateSecurity(
    settings: SecuritySettings,
    options?: RequestOptions,
  ): Promise<void> {
    return this.http.put<void>('/v1/gate/settings/security', {
      body: settings,
      ...options,
    });
  }

  /**
   * Returns the tenant's social login (OIDC) providers and whether each is
   * enabled. Covers all providers Gate supports, regardless of state.
   */
  async getOidcProviders(options?: RequestOptions): Promise<OidcProvider[]> {
    const res = await this.http.get<{ providers: OidcProvider[] }>(
      '/v1/gate/settings/oidc-providers',
      options,
    );
    return res.providers;
  }

  /**
   * Sets the `enabled` flag for one or more social login providers. Any
   * provider omitted from `providers` is left unchanged. Returns the full,
   * updated provider list.
   *
   * @example
   * await gate.settings.updateOidcProviders([
   *   { provider: 'github', enabled: true },
   *   { provider: 'google', enabled: true },
   * ]);
   */
  async updateOidcProviders(
    providers: OidcProvider[],
    options?: RequestOptions,
  ): Promise<OidcProvider[]> {
    const res = await this.http.put<{ providers: OidcProvider[] }>(
      '/v1/gate/settings/oidc-providers',
      { body: { providers }, ...options },
    );
    return res.providers;
  }
}
