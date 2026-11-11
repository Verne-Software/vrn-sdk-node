import { describe, expect, it } from 'vitest';
import { VerneAPIError } from '../src/index.js';

describe('VerneAPIError.fromResponse()', () => {
  it('reads the documented { error: { ... } } envelope', () => {
    const err = VerneAPIError.fromResponse(400, {
      error: {
        code: 'invalid_payload',
        message: "Field 'event_type' is required.",
        request_id: 'req_abc123',
      },
    });

    expect(err.code).toBe('invalid_payload');
    expect(err.message).toBe("Field 'event_type' is required.");
    expect(err.status).toBe(400);
    expect(err.requestId).toBe('req_abc123');
  });

  it('reads reason next to an unchanged code, and keeps it in details', () => {
    const err = VerneAPIError.fromResponse(409, {
      error: {
        code: 'conflict',
        message: 'This role is held by 2 members and cannot be deleted.',
        request_id: 'req_1',
        reason: 'role_held',
      },
    });
    expect(err.code).toBe('conflict');
    expect(err.reason).toBe('role_held');
    expect(err.details).toEqual({ reason: 'role_held' });
  });

  it('has no reason when the envelope carries none', () => {
    const err = VerneAPIError.fromResponse(404, {
      error: { code: 'not_found', message: 'No such identity.', request_id: 'req_1' },
    });
    expect(err.reason).toBeUndefined();
  });

  it('passes an unknown reason through as it came', () => {
    const err = VerneAPIError.fromResponse(409, {
      error: { code: 'conflict', message: 'x', request_id: 'r', reason: 'something_new' },
    });
    expect(err.reason).toBe('something_new');
  });

  it("does not take an identity-service body's sentence for a reason", () => {
    const err = VerneAPIError.fromResponse(400, {
      error: { code: 400, status: 'Bad Request', reason: 'The request was malformed.', message: 'm' },
    });
    expect(err.reason).toBeUndefined();
    const nonString = VerneAPIError.fromResponse(404, {
      error: { code: 'not_found', message: 'm', reason: 42 },
    });
    expect(nonString.reason).toBeUndefined();
  });

  it('surfaces validation details from a { detail: [...] } body', () => {
    const err = VerneAPIError.fromResponse(422, {
      detail: [
        { loc: ['body', '', ''], msg: 'missing field `eventType`', type: 'value_error.jsondecode' },
      ],
    });

    expect(err.status).toBe(422);
    expect(err.message).toBe('missing field `eventType`');
    expect(err.code).toBe('unknown');
    expect(err.requestId).toBeUndefined();
  });

  it('joins multiple validation details', () => {
    const err = VerneAPIError.fromResponse(422, {
      detail: [{ msg: 'field a is required' }, { msg: 'field b is required' }],
    });

    expect(err.message).toBe('field a is required; field b is required');
  });

  it('accepts a string detail and a bare message field', () => {
    expect(VerneAPIError.fromResponse(403, { detail: 'Forbidden' }).message).toBe('Forbidden');
    expect(VerneAPIError.fromResponse(500, { message: 'boom' }).message).toBe('boom');
  });

  it('falls back to the status for unrecognised bodies', () => {
    for (const body of [{}, null, undefined, 'gateway timeout', 42, [], { error: '' }]) {
      const err = VerneAPIError.fromResponse(502, body);
      expect(err.message).toBe('HTTP 502');
      expect(err.code).toBe('unknown');
      expect(err.status).toBe(502);
    }
  });

  it('never throws while building the error, whatever the body is', () => {
    // Regression: `body.error.code` used to throw a TypeError from inside the
    // error path, hiding the real status from every caller.
    expect(() => VerneAPIError.fromResponse(422, { detail: [] })).not.toThrow();
    expect(() => VerneAPIError.fromResponse(500, Object.create(null))).not.toThrow();
  });

  it('keeps the raw body for diagnosis', () => {
    const body = { detail: [{ msg: 'nope' }] };
    expect(VerneAPIError.fromResponse(422, body).body).toEqual(body);
  });
});
