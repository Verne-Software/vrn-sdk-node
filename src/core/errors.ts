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
  /** Request ID to include when contacting support. */
  readonly requestId: string;

  constructor({
    code,
    message,
    status,
    requestId,
  }: {
    code: string;
    message: string;
    status: number;
    requestId: string;
  }) {
    super(message);
    this.name = 'VerneAPIError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }

  static fromResponse(status: number, body: APIErrorBody): VerneAPIError {
    return new VerneAPIError({
      code: body.error.code,
      message: body.error.message,
      status,
      requestId: body.error.request_id,
    });
  }
}

/** Shape of the API error envelope returned by all Verne services. */
export interface APIErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}
