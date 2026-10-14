import { seg } from '../../core/http.js';
import type { HttpClient } from '../../core/http.js';
import type { RequestOptions } from '../../core/types.js';
import type { GateSession, SessionCheck } from './types.js';

/** End users' sessions: list, revoke, and check one is good enough to act on. */
export class SessionsResource {
  constructor(private readonly http: HttpClient) {}

  /** The active sessions of one of your end users (a bare array, not paged). */
  async list(identityId: string, options?: RequestOptions): Promise<GateSession[]> {
    return this.http.get<GateSession[]>(`/v1/gate/identities/${seg(identityId)}/sessions`, options);
  }

  /**
   * Revokes every session of an end user — "log out everywhere". Signed tokens already
   * issued keep verifying until their own `exp` (at most 15 minutes).
   *
   * Idempotent: a user of yours with no session at all is a success too. An id that is not
   * one of your users — another account's, unknown, or one you deleted — is
   * `403 forbidden`. `404 not_found` is rare: a user removed from the identity service
   * other than through `identities.delete()`, which Gate still remembered as yours.
   */
  async revokeAll(identityId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/gate/identities/${seg(identityId)}/sessions`, options);
  }

  /**
   * Revokes one session by its id. Revoking an already revoked session of your user is a
   * success too; an id that is not one of your users' sessions is `404`.
   */
  async revoke(sessionId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`/v1/gate/sessions/${seg(sessionId)}`, options);
  }

  /**
   * Whether an end user's session meets what your tenant requires — the one call to
   * gate your own routes on. Gate on `mfa_satisfied`. Also lists the user's
   * organizations in the key's project, read now.
   *
   * Throws `VerneAPIError` with `status 401` for a dead, foreign or unknown session, and
   * `code 'mfa_required'` (`403`) when a second factor is owed: start a step-up flow with
   * `gate.createLoginFlow({ aal: 'aal2', session_token })`.
   */
  async check(sessionToken: string, options?: RequestOptions): Promise<SessionCheck> {
    return this.http.get<SessionCheck>('/v1/gate/auth/session', { sessionToken, ...options });
  }
}
