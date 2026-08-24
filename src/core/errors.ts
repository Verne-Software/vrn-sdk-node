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
  /** Machine-readable error code (e.g. 'invalid_payload', 'unauthorized'). */
  readonly code: string;
  /** HTTP status code. */
  readonly status: number;
  /**
   * Request ID to include when contacting support.
   * Undefined when the response did not carry the documented error envelope.
   */
  readonly requestId?: string;
  /** Raw parsed error body, kept so unrecognised shapes stay diagnosable. */
  readonly body?: unknown;

  constructor({
    code,
    message,
    status,
    requestId,
    body,
  }: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    body?: unknown;
  }) {
    super(message);
    this.name = 'VerneAPIError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }

  /**
   * Builds an error from a parsed response body of *unknown* shape.
   *
   * The documented envelope is `{ error: { code, message, request_id } }`, but a
   * response can also come from a gateway, a proxy or an endpoint that has drifted
   * from the spec. Anything unrecognised degrades to `HTTP <status>` rather than
   * throwing — an error path must never be the thing that fails.
   */
  static fromResponse(status: number, body: unknown): VerneAPIError {
    const envelope = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    return new VerneAPIError({
      code: typeof envelope?.code === 'string' ? envelope.code : 'unknown',
      message: extractMessage(body, status),
      status,
      requestId: typeof envelope?.request_id === 'string' ? envelope.request_id : undefined,
      body,
    });
  }
}

/** Shape of the API error envelope documented for all Verne services. */
export interface APIErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Best-effort human-readable message from an arbitrary error body.
 * Recognises the documented envelope first, then the `{ detail: ... }` shape
 * validation errors currently arrive in, then a bare `message` field.
 */
function extractMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const envelope = body.error;
    if (isRecord(envelope) && typeof envelope.message === 'string') {
      return envelope.message;
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
