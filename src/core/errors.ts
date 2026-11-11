/**
 * Base class for all errors thrown by the Verne SDK.
 */
export class VerneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerneError';
  }
}

/**
 * Thrown when the Verne API returns an error response.
 * Contains structured information from the API error envelope.
 */
export class VerneAPIError extends VerneError {
  /**
   * Machine-readable error code, e.g. `'invalid_payload'`, `'forbidden'`, `'conflict'`,
   * `'mfa_required'`, `'ACTIVE_USER_LIMIT_REACHED'`. Codes are an open set: compare
   * against the ones you handle and treat the rest generically. `'unknown'` when the
   * response carried no string code — which the API's own routes no longer do; it is
   * left for a body that did not come from the gateway (a proxy in between, an identity
   * service response passed through on `/auth/*`).
   */
  readonly code: string;
  /** HTTP status code. */
  readonly status: number;
  /**
   * Request ID to include when contacting support.
   * Undefined when the response did not carry one.
   */
  readonly requestId?: string;
  /**
   * The members of `error` other than `code`, `message` and `request_id` — for example
   * `plan`, `limit` and `current` on a `402` limit refusal, `kind` on a Clockwork one,
   * `required_aal` and `current_aal` on `403 mfa_required`. Empty when there are none.
   */
  readonly details: Record<string, unknown>;
  /**
   * Which one of its kind the error is, when the API says: on the organization routes a
   * `404 not_found` names what was not found (`'organization'`, `'role'`, `'member'`,
   * `'end_user'`, `'project'`) and a `409 conflict` why it is one (`'role_name_taken'`,
   * `'role_held'`, `'already_member'`). See {@link ErrorReason}. `code` is unchanged, so
   * code that ignores `reason` behaves as before. Undefined when the error has none — and
   * for a body that is not the API's envelope. The same value stays in `details.reason`.
   */
  readonly reason?: ErrorReason | (string & {});
  /**
   * Seconds from the `Retry-After` header, when the response had one — on a `429` it is
   * how long to wait. For `RELAY_MESSAGE_LIMIT_REACHED` it runs to the 1st of next month.
   */
  readonly retryAfter?: number;
  /** Raw parsed error body, kept so unrecognised shapes stay diagnosable. */
  readonly body?: unknown;

  constructor({
    code,
    message,
    status,
    requestId,
    details,
    reason,
    retryAfter,
    body,
  }: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    details?: Record<string, unknown>;
    reason?: string;
    retryAfter?: number;
    body?: unknown;
  }) {
    super(message);
    this.name = 'VerneAPIError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details ?? {};
    this.reason = reason;
    this.retryAfter = retryAfter;
    this.body = body;
  }

  /**
   * Builds an error from a parsed response body of *unknown* shape.
   *
   * Every API route answers with the envelope `{ error: { code, message, request_id,
   * ...extra } }`. Other shapes are still read, as a fallback that costs nothing: the
   * string form `{ error: "<sentence>" }` Clockwork used before October 2026, and an
   * identity-service body whose `code` is a number (still what Kratos' own `/auth/*`
   * self-service routes answer). Anything unrecognised degrades — to code `'unknown'`,
   * to `HTTP <status>` — rather than throwing: an error path must never be the thing
   * that fails. `reason` is read only from the envelope proper (a string `code`): in an
   * identity-service body it is a sentence for people, not a code.
   */
  static fromResponse(status: number, body: unknown, retryAfter?: number): VerneAPIError {
    const envelope = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const details: Record<string, unknown> = {};
    if (envelope) {
      for (const [key, value] of Object.entries(envelope)) {
        if (key !== 'code' && key !== 'message' && key !== 'request_id') details[key] = value;
      }
    }
    return new VerneAPIError({
      code: typeof envelope?.code === 'string' ? envelope.code : 'unknown',
      message: extractMessage(body, status),
      status,
      requestId: typeof envelope?.request_id === 'string' ? envelope.request_id : undefined,
      details,
      reason:
        typeof envelope?.code === 'string' && typeof envelope.reason === 'string'
          ? envelope.reason
          : undefined,
      retryAfter,
      body,
    });
  }
}

/**
 * The `reason` of a `404 not_found` or a `409 conflict` on the organization routes, in
 * {@link VerneAPIError.reason}. The set is open: a route may grow a reason later, so keep a
 * branch for one you do not know.
 *
 * | `code` | `reason` | When |
 * |:--|:--|:--|
 * | `not_found` | `organization` | No such organization in the key's project. |
 * | `not_found` | `role` | No such role in that organization. |
 * | `not_found` | `member` | The person is not a member of the organization. |
 * | `not_found` | `end_user` | `identity_id` is not one of your end users. |
 * | `not_found` | `project` | No such project. |
 * | `conflict` | `role_name_taken` | The organization already has a role with that name. |
 * | `conflict` | `role_held` | Someone holds the role, so it cannot be deleted. |
 * | `conflict` | `already_member` | The person is already a member. |
 *
 * A role limit hit is `409 limit_reached`, with no reason.
 */
export type ErrorReason =
  | 'organization'
  | 'role'
  | 'member'
  | 'end_user'
  | 'project'
  | 'role_name_taken'
  | 'role_held'
  | 'already_member';

/** Why a signed token was refused by {@link VerneTokenError}. */
export type TokenErrorReason =
  | 'malformed'
  | 'unsupported_alg'
  | 'unknown_kid'
  | 'bad_signature'
  | 'wrong_issuer'
  | 'expired'
  | 'not_yet_valid'
  | 'missing_claim'
  | 'jwks_unavailable';

/**
 * Thrown by signed-token verification (`GateTokenVerifier`, `gate.tokens.verifySigned`)
 * when a token must not be trusted. `reason` says why.
 */
export class VerneTokenError extends VerneError {
  readonly reason: TokenErrorReason;

  constructor(reason: TokenErrorReason, message: string) {
    super(message);
    this.name = 'VerneTokenError';
    this.reason = reason;
  }
}

/** Shape of the API error envelope documented for all Verne services. */
export interface APIErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    [extra: string]: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Best-effort human-readable message from an arbitrary error body.
 * Recognises the documented envelope first, then a string `error` (Clockwork), then the
 * `{ detail: ... }` shape validation errors can arrive in, then a bare `message` field.
 */
function extractMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const envelope = body.error;
    if (isRecord(envelope) && typeof envelope.message === 'string') {
      return envelope.message;
    }
    if (typeof envelope === 'string' && envelope.trim() !== '') {
      return envelope;
    }

    const { detail } = body;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (isRecord(item) && typeof item.msg === 'string' ? item.msg : null))
        .filter((msg): msg is string => msg !== null);
      if (messages.length > 0) return messages.join('; ');
    }

    if (typeof body.message === 'string') return body.message;
  }

  return `HTTP ${status}`;
}
