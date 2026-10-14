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
    retryAfter,
    body,
  }: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
    body?: unknown;
  }) {
    super(message);
    this.name = 'VerneAPIError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details ?? {};
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
   * that fails.
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
      retryAfter,
      body,
    });
  }
}

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
