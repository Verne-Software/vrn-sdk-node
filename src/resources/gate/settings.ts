import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { OidcProvider, SecuritySettings } from './types.js';

export class SettingsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Returns the tenant's security settings (passwordless / MFA). With `mfa_enabled`,
   * `sessions.check()` refuses a session without a second factor (`403 mfa_required`).
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
  async updateSecurity(settings: SecuritySettings, options?: RequestOptions): Promise<void> {
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

  /**
   * The project's social-login return URLs — the addresses on your backend that receive
   * the user (with a one-time `code`) after a social login. The first is the default.
   */
  async getReturnUrls(options?: RequestOptions): Promise<string[]> {
    const res = await this.http.get<{ return_urls: string[] }>(
      '/v1/gate/settings/return-urls',
      options,
    );
    return res.return_urls;
  }

  /**
   * Replaces the project's return URLs (at most 10; an empty list switches the feature
   * off) and returns them as they will be matched — exactly, never by prefix. `https`
   * only, except `http://localhost` and `http://127.0.0.1`; no query, fragment, `@` or
   * wildcard (`400 invalid_payload` names the entry).
   */
  async updateReturnUrls(urls: string[], options?: RequestOptions): Promise<string[]> {
    const res = await this.http.put<{ return_urls: string[] }>('/v1/gate/settings/return-urls', {
      body: { return_urls: urls },
      ...options,
    });
    return res.return_urls;
  }
}
