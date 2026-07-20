import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { SecuritySettings } from './types.js';

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
}
