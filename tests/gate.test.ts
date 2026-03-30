import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gate, VerneAPIError } from '../src/index.js';

const API_KEY = 'vrn_gate_test_sk_abc123';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

describe('Gate', () => {
  let gate: Gate;

  beforeEach(() => {
    gate = new Gate({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Identities
  // ---------------------------------------------------------------------------

  describe('identities.create()', () => {
    it('sends POST /v1/gate/identities', async () => {
      const identity = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com', tenant_id: 'ten_1' } };
      const spy = mockFetch(201, identity);

      const result = await gate.identities.create({
        schema_id: 'user',
        traits: { email: 'a@b.com' },
        state: 'active',
      });

      expect(result).toEqual(identity);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/identities');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe('identities.get()', () => {
    it('sends GET /v1/gate/identities/:id', async () => {
      const identity = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com', tenant_id: 'ten_1' } };
      const spy = mockFetch(200, identity);

      const result = await gate.identities.get('identity_1');

      expect(result).toEqual(identity);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/identities/identity_1');
      expect(init?.method).toBe('GET');
    });
  });

  describe('identities.patch()', () => {
    it('sends PATCH /v1/gate/identities/:id with JSON Patch ops', async () => {
      const updated = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com', tenant_id: 'ten_1', custom_data: { role: 'admin' } } };
      const spy = mockFetch(200, updated);

      const ops = [{ op: 'replace' as const, path: '/traits/custom_data/role', value: 'admin' }];
      const result = await gate.identities.patch('identity_1', ops);

      expect(result).toEqual(updated);
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body).toEqual(ops);
    });
  });

  describe('identities.delete()', () => {
    it('sends DELETE /v1/gate/identities/:id', async () => {
      const spy = mockFetch(204, null);

      await gate.identities.delete('identity_1');

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/identities/identity_1');
      expect(init?.method).toBe('DELETE');
    });
  });

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------

  describe('tokens.create()', () => {
    it('sends api_key in body and skips Authorization header', async () => {
      const tokenResponse = { access_token: 'gat_test_at_abc', expires_at: '2026-01-01T01:00:00Z', subject: 'usr_1', tenant_id: 'ten_1' };
      const spy = mockFetch(200, tokenResponse);

      const result = await gate.tokens.create({ subject: 'usr_1' });

      expect(result).toEqual(tokenResponse);

      const [, init] = spy.mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.api_key).toBe(API_KEY);
      expect(body.subject).toBe('usr_1');

      // Must NOT include Authorization header
      expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('includes optional scopes and ttl_seconds', async () => {
      const spy = mockFetch(200, { access_token: 'tok', expires_at: '2026-01-01T01:00:00Z', subject: 'usr_1', tenant_id: 'ten_1' });

      await gate.tokens.create({ subject: 'usr_1', scopes: ['gate.tokens.read'], ttl_seconds: 7200 });

      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.scopes).toEqual(['gate.tokens.read']);
      expect(body.ttl_seconds).toBe(7200);
    });
  });

  describe('tokens.introspect()', () => {
    it('sends POST /v1/gate/tokens/introspect', async () => {
      const introspectResult = { active: true, subject: 'usr_1', tenant_id: 'ten_1', scopes: [], expires_at: '2026-01-01T01:00:00Z' };
      const spy = mockFetch(200, introspectResult);

      const result = await gate.tokens.introspect('gat_test_at_abc');

      expect(result).toEqual(introspectResult);
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.access_token).toBe('gat_test_at_abc');
    });
  });

  // ---------------------------------------------------------------------------
  // Authorize
  // ---------------------------------------------------------------------------

  describe('gate.authorize()', () => {
    it('sends POST /v1/gate/authorize', async () => {
      const decision = { allowed: true, decision_id: 'dec_1', reason: 'role=admin' };
      const spy = mockFetch(200, decision);

      const result = await gate.authorize({
        subject: 'usr_1',
        action: 'relay.messages.read',
        resource: 'tenant:ten_1',
      });

      expect(result).toEqual(decision);
      const [url] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/authorize');
    });

    it('returns allowed: false without throwing', async () => {
      mockFetch(200, { allowed: false, decision_id: 'dec_2', reason: 'no matching policy' });

      const result = await gate.authorize({ subject: 'usr_2', action: 'relay.messages.write', resource: 'tenant:ten_1' });
      expect(result.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws VerneAPIError with correct fields on API error', async () => {
      mockFetch(400, {
        error: { code: 'invalid_token', message: 'Token is expired.', request_id: 'req_err' },
      });

      const err = await gate.tokens.introspect('bad_token').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VerneAPIError);
      const apiErr = err as VerneAPIError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('invalid_token');
      expect(apiErr.requestId).toBe('req_err');
      expect(apiErr.message).toBe('Token is expired.');
    });
  });
});
