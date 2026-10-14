import type { ListParams } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Identity Management
// ---------------------------------------------------------------------------

/**
 * An end user (a Kratos identity) managed by Gate.
 *
 * The object is the identity service's own; the stable fields are typed and the rest
 * stays reachable through the index signature.
 */
export interface Identity {
  id: string;
  schema_id: string;
  state: 'active' | 'inactive';
  traits: IdentityTraits;
  created_at?: string;
  updated_at?: string;
  state_changed_at?: string;
  /** Your custom metadata. Read and change it with `identities.getMetadata()` / `updateMetadata()`. */
  metadata_public?: Record<string, unknown> | null;
  verifiable_addresses?: Array<{ value: string; verified: boolean; via: string; status?: string }>;
  recovery_addresses?: Array<{ value: string; via: string }>;
  [key: string]: unknown;
}

/**
 * An end user's traits. The `user` schema has exactly two: `email` (required) and
 * `locale`. Application data does not go here — keep it in custom metadata
 * (`identities.updateMetadata()`).
 */
export interface IdentityTraits {
  email: string;
  locale?: string;
  [key: string]: unknown;
}

/**
 * Parameters for creating a new identity (end user) bound to your tenant.
 */
export interface CreateIdentityParams {
  /** Must be 'user'. */
  schema_id: 'user';
  /**
   * The schema allows only these two traits; anything else is refused with
   * `400 invalid_payload`. Use custom metadata for your own fields.
   */
  traits: {
    email: string;
    locale?: string;
  };
  credentials?: {
    password?: {
      config: {
        password: string;
      };
    };
  };
  state?: 'active' | 'inactive';
}

/**
 * A single operation in a JSON Patch document (RFC 6902).
 * Used by identities.patch() to partially update an identity.
 */
export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

// ---------------------------------------------------------------------------
// Tenant Settings
// ---------------------------------------------------------------------------

/** Security-related Gate Identity settings for your tenant. */
export interface SecuritySettings {
  /** Whether sign-in and sign-up by an emailed one-time code is enabled. */
  passwordless_enabled: boolean;
  /** Whether a second factor (TOTP) is required — enforced by `sessions.check()`. */
  mfa_enabled: boolean;
}

/**
 * A social login (OAuth 2.0 / OIDC) provider and whether it is enabled for
 * your tenant's end-users.
 */
export interface OidcProvider {
  /** Provider identifier, e.g. `'github'`, `'google'`, `'gitlab'`. */
  provider: string;
  /** Whether the provider appears in your tenant's login/registration UI. */
  enabled: boolean;
}

/**
 * A Kratos self-service auth flow returned by {@link Gate.createLoginFlow}.
 *
 * The shape mirrors the raw Ory Kratos flow JSON (`ui.nodes`, `ui.action`,
 * …); pass it straight to your browser-side code to render social buttons.
 */
export type LoginFlow = Record<string, unknown>;

/** Optional parameters of `gate.createLoginFlow()`. */
export interface LoginFlowParams {
  /**
   * One of the project's registered return URLs, exactly as registered (see
   * `settings.updateReturnUrls()`). The first one is used when absent.
   */
  return_to?: string;
  /**
   * An opaque value of yours, 1–256 characters of letters, digits, `-`, `.`, `_`, `~`,
   * returned unchanged on the redirect to your return URL. Always send one and check it.
   */
  state?: string;
  /** `'aal2'` starts a step-up (second factor) flow; needs `session_token`. */
  aal?: 'aal1' | 'aal2';
  /** The end user's session token, for a step-up flow. Sent as `X-Session-Token`. */
  session_token?: string;
}

/** Optional parameters of `gate.createRegistrationFlow()`. */
export interface RegistrationFlowParams {
  /** As for the login flow. */
  return_to?: string;
  /** As for the login flow. */
  state?: string;
}

/** What `exchangeOidcCode()` returns: the same shape a password login returns. */
export interface OidcExchangeResult {
  /** The end user's session token. Keep it on your server. */
  session_token: string;
  session: GateSession;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Access & Authorization
// ---------------------------------------------------------------------------

/** Short-lived access token returned by tokens.create(). */
export interface AccessToken {
  access_token: string;
  expires_at: string;
  subject: string;
  tenant_id: string;
}

/** Parameters for exchanging an API key for a short-lived access token. */
export interface CreateTokenParams {
  /** The ID of the user or service account this token represents. */
  subject: string;
  /** Optional list of scopes to narrow the token's permissions. */
  scopes?: string[];
  /** Custom lifetime in seconds. Default 3600, max 86400. */
  ttl_seconds?: number;
}

/**
 * One organization a user belongs to: the unit Gate uses everywhere it says who a user
 * is — in introspection, the session check, the signed token's `orgs` claim and
 * `identities.listOrganizations()`.
 */
export interface OrgClaim {
  /** The organization's id. */
  id: string;
  /** The name of the role the user holds there. */
  role: string;
  /** That role's permissions, e.g. `'invoices:write'`. */
  permissions: string[];
}

/**
 * Result of token introspection.
 *
 * An inactive token (unknown, expired, another tenant's, or its user deactivated or
 * deleted) is `{ active: false }` and nothing else.
 */
export interface IntrospectResult {
  active: boolean;
  subject?: string;
  tenant_id?: string;
  scopes?: string[];
  expires_at?: string;
  /**
   * When `subject` is an end user's id: their organizations in the key's project, read
   * live, the first 100 in the order they joined. Absent for any other subject.
   */
  orgs?: OrgClaim[];
  /** `true`, and only then, when there are more than `orgs` shows. */
  orgs_truncated?: boolean;
}

/** Parameters for checking whether a subject can perform an action. */
export interface AuthorizeParams {
  /** The end user's identity id. */
  subject: string;
  /**
   * For an organization resource: the permission to check, e.g. `'invoices:write'`.
   * Otherwise a label for your own records.
   */
  action: string;
  /**
   * `'organization:<uuid>'` to check a permission in an organization (prefer
   * `organizations.authorize()` / `can()`, which build it); anything else asks only
   * whether `subject` is one of your active end users.
   */
  resource: string;
  /** Accepted and ignored by the API today. */
  context?: Record<string, unknown>;
}

/** Why an organization permission check answered as it did. */
export type OrganizationAuthorizeReason =
  | 'member_with_permission'
  | 'member_without_permission'
  | 'not_a_member'
  | 'subject_inactive'
  | 'no_such_organization';

/** Authorization decision returned by gate.authorize(). */
export interface AuthorizeResult {
  allowed: boolean;
  /** Identifies the decision in Gate's logs, for support. */
  decision_id: string;
  /**
   * For an organization resource, one of {@link OrganizationAuthorizeReason}. For any
   * other resource, a sentence for people, not a value to branch on.
   */
  reason: OrganizationAuthorizeReason | (string & {});
  /**
   * The role the user holds in the organization — present for
   * `member_with_permission`, `member_without_permission` and `subject_inactive`.
   */
  role?: string;
}

// ---------------------------------------------------------------------------
// Signed tokens (JWT)
// ---------------------------------------------------------------------------

/** What `tokens.createSigned()` returns. */
export interface SignedToken {
  /** The compact ES256 JWT. Valid for 15 minutes; it cannot be revoked. */
  token: string;
  /** The session the token was made from, as `whoami` returns it. */
  session: GateSession;
}

/** The verified payload of a Gate signed token. */
export interface SignedTokenClaims {
  /** `<base URL>/auth/<tenant id>` — checked by the verifier. */
  iss: string;
  /** The end user's identity id. */
  sub: string;
  /** The session the token was made from (revocable with `sessions.revoke()`). */
  sid: string;
  tenant_id: string;
  schema_id: string;
  email: string | null;
  /** Always `'authenticated'` (the database role PostgREST-style consumers use). */
  role: string;
  /** The user's organizations across all your projects, as of when the token was made. */
  orgs: OrgClaim[];
  /** `true` when `orgs` is incomplete; list them with `identities.listOrganizations()`. */
  orgs_truncated?: boolean;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  [claim: string]: unknown;
}

/** Options of `tokens.verifySigned()`. */
export interface VerifySignedOptions {
  /** Your tenant id: the issuer is built from it. */
  tenantId: string;
  /** Allowed clock skew in seconds for `exp` and `nbf`. Default 10. */
  clockToleranceSeconds?: number;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** An end user's session, as the identity service returns it. */
export interface GateSession {
  id: string;
  active?: boolean;
  authenticated_at?: string;
  expires_at?: string;
  issued_at?: string;
  authenticator_assurance_level?: string;
  authentication_methods?: Array<{ method: string; completed_at?: string; [key: string]: unknown }>;
  devices?: Array<{ id?: string; ip_address?: string; user_agent?: string; location?: string }>;
  identity?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The answer of `sessions.check()` — whether a session is good enough to act on. */
export interface SessionCheck {
  active: boolean;
  /** `'aal1'` or `'aal2'`. */
  aal: string;
  /** Whether your tenant requires a second factor. */
  mfa_required: boolean;
  /** Whether this session meets what your tenant requires — the one field to gate on. */
  mfa_satisfied: boolean;
  identity_id: string | null;
  /** The user's organizations in the key's project, read now (first 100). */
  orgs?: OrgClaim[];
  orgs_truncated?: boolean;
}

// ---------------------------------------------------------------------------
// Organizations, roles, members
// ---------------------------------------------------------------------------

/** A group of your end users (a customer's team, workspace, company). */
export interface Organization {
  id: string;
  /** Free text, 1–120 characters, not unique. */
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganizationParams {
  name: string;
}

export interface UpdateOrganizationParams {
  name: string;
}

/** A named set of permissions inside one organization. */
export interface Role {
  id: string;
  organization_id: string;
  /** Lowercase letters, digits, `_` and `-`; unique in the organization. */
  name: string;
  /** Sorted and de-duplicated by the API. */
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoleParams {
  /** 1–64 characters: lowercase letters, digits, `_`, `-`, starting with a letter or digit. */
  name: string;
  /** Lowercase segments joined by `:`, e.g. `'invoices:write'`. `*` and `nautilus:` are reserved. */
  permissions?: string[];
}

export interface UpdateRoleParams {
  name?: string;
  /** Replaces the whole set. Everyone holding the role has the new set at once. */
  permissions?: string[];
}

/** An end user's membership of an organization. */
export interface Member {
  organization_id: string;
  identity_id: string;
  role_id: string;
  /** When the membership ends, or `null` for never. */
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddMemberParams {
  /** One of your end users. */
  identity_id: string;
  /** A role of this organization. */
  role_id: string;
  /** A future time (at most 10 years ahead) when the membership ends. */
  expires_at?: string | Date | null;
}

export interface UpdateMemberParams {
  /** Move the member to another role of this organization. */
  role_id?: string;
  /** Leave it out to keep the deadline, `null` to remove it, a time to set it. */
  expires_at?: string | Date | null;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditActorType = 'team_member' | 'api_key' | 'end_user' | 'system' | 'staff';

/** Filters of `auditLog.list()`. */
export interface ListAuditLogParams extends ListParams {
  /** One action, e.g. `'key.created'`, `'identity.login'`, `'organization.member_added'`. */
  action?: string;
  actor_id?: string;
  actor_type?: AuditActorType;
  target_id?: string;
  /** Entries at or after this instant. */
  from?: string | Date;
  /** Entries before this instant. Must be later than `from`. */
  to?: string | Date;
}

/** One entry of the audit log. */
export interface AuditLogEntry {
  id: string;
  occurred_at: string;
  /** Open set: new actions are added over time. */
  action: string;
  actor: { type: AuditActorType | 'unknown' | (string & {}); id: string | null };
  target: { type: string; id: string } | null;
  project_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
}

// ---------------------------------------------------------------------------
// Automatic deletion (lifecycle rules)
// ---------------------------------------------------------------------------

export type LifecycleRuleKind =
  | 'delete_unverified'
  | 'remind_unverified'
  | 'expire_roles'
  | 'delete_inactive';

/** Settings of each rule kind. */
export interface LifecycleRuleParamsByKind {
  delete_unverified: { delete_after_days: number; warn_before_days: number };
  remind_unverified: { remind_after_hours: number };
  expire_roles: Record<string, never>;
  delete_inactive: {
    inactive_after_months: number;
    warn_before_days: number;
    include_without_address?: boolean;
  };
}

export interface LifecycleRule {
  kind: LifecycleRuleKind;
  configured: boolean;
  enabled: boolean;
  params: Record<string, unknown> | null;
  /** Whether your plan includes the rule. */
  available: boolean;
  /** `'plan'` when a plan change switched the rule off. */
  disabled_reason: 'plan' | null;
  enabled_at: string | null;
  updated_at: string | null;
  /** How many people have something scheduled by this rule. */
  pending: number;
}

export interface LifecycleRules {
  /** Your plan: `free`, `pro`, `advanced` or `contract`. */
  tier: string;
  /** All four kinds, set up or not. */
  rules: LifecycleRule[];
}

export interface SetLifecycleRuleParams<K extends LifecycleRuleKind = LifecycleRuleKind> {
  enabled: boolean;
  /** Leave out to keep the saved settings. Required on a first write (except `expire_roles`). */
  params?: LifecycleRuleParamsByKind[K];
}

export interface LifecycleRulePreview {
  kind: LifecycleRuleKind;
  available: boolean;
  /** How many people the rule would schedule right now. */
  matching_now: number;
  /** `true` when the count stopped at 1,000. */
  capped: boolean;
}

export interface ListLifecycleActionsParams extends ListParams {
  status?: 'pending' | 'done' | 'cancelled' | 'failed';
  kind?: LifecycleRuleKind;
  identity_id?: string;
}

export interface LifecycleAction {
  id: string;
  kind: LifecycleRuleKind;
  step: 'remind' | 'warn' | 'delete' | 'revoke';
  identity_id: string;
  status: 'pending' | 'done' | 'cancelled' | 'failed';
  basis_at: string;
  due_at: string;
  /** Why it was cancelled or failed (`rule_disabled`, `verified`, `signed_in`, …). */
  reason: string | null;
  created_at: string;
  finished_at: string | null;
}
