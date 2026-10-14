import { seg } from '../../core/http.js';
import type { HttpClient } from '../../core/http.js';
import type { ListParams, Paginated, RequestOptions } from '../../core/types.js';
import type {
  AddMemberParams,
  AuthorizeResult,
  CreateOrganizationParams,
  CreateRoleParams,
  Member,
  Organization,
  Role,
  UpdateMemberParams,
  UpdateOrganizationParams,
  UpdateRoleParams,
} from './types.js';

const orgPath = (orgId: string) => `/v1/gate/organizations/${seg(orgId)}`;
const pageQuery = (params?: ListParams) => ({ limit: params?.limit, cursor: params?.cursor });
const isoOrNull = (value: string | Date | null) =>
  value instanceof Date ? value.toISOString() : value;

/**
 * Organizations of your end users — their teams, workspaces, companies — with named
 * roles and members. Everything here acts on **the project the API key belongs to**.
 *
 * Gate keeps the data and reports it (introspection, the session check, the signed
 * token's `orgs` claim); it does not enforce permissions. Ask with {@link can}.
 */
export class OrganizationsResource {
  readonly roles: RolesResource;
  readonly members: MembersResource;

  constructor(private readonly http: HttpClient) {
    this.roles = new RolesResource(http);
    this.members = new MembersResource(http);
  }

  /** Creates an organization. `name` is free text, 1–120 characters, not unique. */
  async create(params: CreateOrganizationParams, options?: RequestOptions): Promise<Organization> {
    return this.http.post<Organization>('/v1/gate/organizations', { body: params, ...options });
  }

  /** Lists the project's organizations, oldest first, cursor-paged. */
  async list(params?: ListParams, options?: RequestOptions): Promise<Paginated<Organization>> {
    return this.http.get<Paginated<Organization>>('/v1/gate/organizations', {
      query: pageQuery(params),
      ...options,
    });
  }

  async get(orgId: string, options?: RequestOptions): Promise<Organization> {
    return this.http.get<Organization>(orgPath(orgId), options);
  }

  /** Renames an organization. */
  async update(
    orgId: string,
    params: UpdateOrganizationParams,
    options?: RequestOptions,
  ): Promise<Organization> {
    return this.http.patch<Organization>(orgPath(orgId), { body: params, ...options });
  }

  /** Deletes an organization with its roles and memberships. */
  async delete(orgId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(orgPath(orgId), options);
  }

  /**
   * *May this end user do this in this organization?* — answered from the role the user
   * holds there and its permissions, as they are now. `permission` must match exactly
   * (no wildcards). An organization of another project looks like a missing one
   * (`no_such_organization`). An invalid permission (upper case, `*`, the `nautilus:`
   * prefix) is a `400` error, never `allowed: false`. Not billed, not audited.
   */
  async authorize(
    orgId: string,
    identityId: string,
    permission: string,
    options?: RequestOptions,
  ): Promise<AuthorizeResult> {
    return this.http.post<AuthorizeResult>('/v1/gate/authorize', {
      body: { subject: identityId, action: permission, resource: `organization:${orgId}` },
      ...options,
    });
  }

  /**
   * `true` when the end user holds `permission` in the organization — the boolean of
   * {@link authorize}. Errors are thrown, not turned into `false`.
   *
   * @example
   * if (!(await gate.organizations.can(orgId, userId, 'invoices:write'))) {
   *   throw new Error('Forbidden');
   * }
   */
  async can(
    orgId: string,
    identityId: string,
    permission: string,
    options?: RequestOptions,
  ): Promise<boolean> {
    const decision = await this.authorize(orgId, identityId, permission, options);
    return decision.allowed === true;
  }
}

/** Roles of one organization: named sets of permissions. */
export class RolesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Defines a role. `409 conflict` if the name is taken in the organization,
   * `409 limit_reached` past 100 roles.
   */
  async create(orgId: string, params: CreateRoleParams, options?: RequestOptions): Promise<Role> {
    return this.http.post<Role>(`${orgPath(orgId)}/roles`, { body: params, ...options });
  }

  async list(
    orgId: string,
    params?: ListParams,
    options?: RequestOptions,
  ): Promise<Paginated<Role>> {
    return this.http.get<Paginated<Role>>(`${orgPath(orgId)}/roles`, {
      query: pageQuery(params),
      ...options,
    });
  }

  async get(orgId: string, roleId: string, options?: RequestOptions): Promise<Role> {
    return this.http.get<Role>(`${orgPath(orgId)}/roles/${seg(roleId)}`, options);
  }

  /**
   * Renames a role and/or **replaces** its permissions. Everyone who holds it has the new
   * permissions the next time they are read.
   */
  async update(
    orgId: string,
    roleId: string,
    params: UpdateRoleParams,
    options?: RequestOptions,
  ): Promise<Role> {
    return this.http.patch<Role>(`${orgPath(orgId)}/roles/${seg(roleId)}`, {
      body: params,
      ...options,
    });
  }

  /** Deletes a role. A role someone holds is refused with `409 conflict`. */
  async delete(orgId: string, roleId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`${orgPath(orgId)}/roles/${seg(roleId)}`, options);
  }
}

/** Members of one organization: end users holding one role each. */
export class MembersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Gives an end user a role in the organization. `404` if the identity is not one of
   * your end users, `409` if they already are a member (change the role with
   * {@link update}).
   */
  async add(orgId: string, params: AddMemberParams, options?: RequestOptions): Promise<Member> {
    const body: Record<string, unknown> = {
      identity_id: params.identity_id,
      role_id: params.role_id,
    };
    if (params.expires_at !== undefined) body.expires_at = isoOrNull(params.expires_at);
    return this.http.post<Member>(`${orgPath(orgId)}/members`, { body, ...options });
  }

  async list(
    orgId: string,
    params?: ListParams,
    options?: RequestOptions,
  ): Promise<Paginated<Member>> {
    return this.http.get<Paginated<Member>>(`${orgPath(orgId)}/members`, {
      query: pageQuery(params),
      ...options,
    });
  }

  /**
   * Changes a member's role and/or deadline. `expires_at`: leave it out to keep the
   * deadline, `null` to remove it, a time to set it.
   */
  async update(
    orgId: string,
    identityId: string,
    params: UpdateMemberParams,
    options?: RequestOptions,
  ): Promise<Member> {
    const body: Record<string, unknown> = {};
    if (params.role_id !== undefined) body.role_id = params.role_id;
    if (params.expires_at !== undefined) body.expires_at = isoOrNull(params.expires_at);
    return this.http.patch<Member>(`${orgPath(orgId)}/members/${seg(identityId)}`, {
      body,
      ...options,
    });
  }

  /** Removes the membership. The person stays your end user. */
  async remove(orgId: string, identityId: string, options?: RequestOptions): Promise<void> {
    return this.http.delete<void>(`${orgPath(orgId)}/members/${seg(identityId)}`, options);
  }
}
