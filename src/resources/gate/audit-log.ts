import type { HttpClient } from '../../core/http.js';
import type { Paginated, RequestOptions } from '../../core/types.js';
import type { AuditLogEntry, ListAuditLogParams } from './types.js';

/**
 * The account's audit log, read-only: who did what, to what, when and from where. The
 * key reads its own project's entries and the account-wide ones.
 *
 * Any key with the `gate` scope reads the whole log, including the IP addresses and
 * user agents of your team members. Keep `gate` keys on your backend.
 */
export class AuditLogResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * One page of entries, newest first. Filters combine; keep the same filters while
   * paging with `cursor`.
   *
   * @example
   * const page = await gate.auditLog.list({ action: 'identity.login', actor_id: userId });
   */
  async list(
    params?: ListAuditLogParams,
    options?: RequestOptions,
  ): Promise<Paginated<AuditLogEntry>> {
    return this.http.get<Paginated<AuditLogEntry>>('/v1/gate/audit-log', {
      query: { ...params },
      ...options,
    });
  }
}
