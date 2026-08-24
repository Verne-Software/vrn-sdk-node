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
    for (const body of [{}, null, undefined, 'gateway timeout', 42, [], { error: 'nope' }]) {
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
