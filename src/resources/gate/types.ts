// ---------------------------------------------------------------------------
// Identity Management
// ---------------------------------------------------------------------------

/** A Kratos identity managed by Gate. */
export interface Identity {
  id: string;
  schema_id: string;
  state: 'active' | 'inactive';
  traits: IdentityTraits;
}

export interface IdentityTraits {
  email: string;
  tenant_id: string;
  custom_data?: Record<string, unknown>;
}

/**
 * Parameters for creating a new identity (end-user) bound to your tenant.
 * The `traits.tenant_id` is injected automatically by the Edge Gateway.
 */
export interface CreateIdentityParams {
  /** Must be 'user'. */
  schema_id: 'user';
  traits: {
    email: string;
    /** Optional arbitrary fields for your application. */
    custom_data?: Record<string, unknown>;
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

/** Result of token introspection. */
export interface IntrospectResult {
  active: boolean;
  subject: string;
  tenant_id: string;
  scopes: string[];
  expires_at: string;
}

/** Parameters for checking whether a subject can perform an action. */
export interface AuthorizeParams {
  /** ID of the user or service account (e.g. 'usr_123'). */
  subject: string;
  /** Action being performed (e.g. 'relay.messages.read'). */
  action: string;
  /** Resource identifier (e.g. 'tenant:ten_001' or 'relay:key:key_123'). */
  resource: string;
  /** Optional extra attributes for policy evaluation. */
  context?: Record<string, unknown>;
}

/** Authorization decision returned by gate.authorize(). */
export interface AuthorizeResult {
  allowed: boolean;
  decision_id: string;
  reason: string;
}
