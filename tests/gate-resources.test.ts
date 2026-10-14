import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gate, Passepartout, Clockwork, VerneAPIError } from '../src/index.js';

const API_KEY = 'vrn_9f8a7c1b2d3e4f50';
const BASE = 'https://api.vernesoft.com';
const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  // One spy per test: a second `vi.spyOn` would start a new call log.
  const spy = vi.isMockFunction(global.fetch) ? vi.mocked(global.fetch) : vi.spyOn(global, 'fetch');
  return spy.mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? headers : { 'Content-Type': 'application/json', ...headers },
    }),
  );
}

function call(spy: ReturnType<typeof mockFetch>, n = 0) {
  const [url, init] = spy.mock.calls[n];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    headers: init?.headers as Record<string, string>,
  };
}

describe('Gate — sessions, metadata, audit log, lifecycle, flows', () => {
  let gate: Gate;

  beforeEach(() => {
    gate = new Gate({ apiKey: API_KEY });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sessions', () => {
    it('list() reads the bare array of an identity\'s sessions', async () => {
      const sessions = [{ id: 's1', active: true, devices: [] }];
      const spy = mockFetch(200, sessions);
      expect(await gate.sessions.list(USER)).toEqual(sessions);
      expect(call(spy).url).toBe(`${BASE}/v1/gate/identities/${USER}/sessions`);
    });

    it('revokeAll() and revoke() send DELETE', async () => {
      const spy = mockFetch(204, null);
      await gate.sessions.revokeAll(USER);
      expect(call(spy).method).toBe('DELETE');
      expect(call(spy).url).toBe(`${BASE}/v1/gate/identities/${USER}/sessions`);

      mockFetch(204, null);
      await gate.sessions.revoke('8e4f0b2a-3c1d-4e5f-9a6b-7c8d9e0f1a2b');
      expect(call(spy, 1).url).toBe(`${BASE}/v1/gate/sessions/8e4f0b2a-3c1d-4e5f-9a6b-7c8d9e0f1a2b`);
    });

    it('revokeAll() resolves on 204 — also for a user with no session', async () => {
      mockFetch(204, null);
      await expect(gate.sessions.revokeAll(USER)).resolves.toBeUndefined();
    });

    it('revokeAll() reads a 404 not_found in the envelope', async () => {
      mockFetch(404, { error: { code: 'not_found', message: 'Identity not found', request_id: 'req_1' } });
      const err = await gate.sessions.revokeAll(USER).catch((e) => e);
      expect(err).toBeInstanceOf(VerneAPIError);
      expect(err.status).toBe(404);
      expect(err.code).toBe('not_found');
      expect(err.requestId).toBe('req_1');
    });

    it('an identity-service body with a numeric code still parses (fallback)', async () => {
      mockFetch(404, { error: { code: 404, status: 'Not Found', message: 'Unable to locate the resource' } });
      const err = await gate.sessions.revokeAll(USER).catch((e) => e);
      expect(err).toBeInstanceOf(VerneAPIError);
      expect(err.status).toBe(404);
      expect(err.code).toBe('unknown');
      expect(err.message).toBe('Unable to locate the resource');
    });

    it('check() sends the session token as X-Session-Token along with the key', async () => {
      const answer = {
        active: true,
        aal: 'aal1',
        mfa_required: false,
        mfa_satisfied: true,
        identity_id: USER,
        orgs: [],
      };
      const spy = mockFetch(200, answer);
      expect(await gate.sessions.check('ory_st_abc')).toEqual(answer);
      const c = call(spy);
      expect(c.url).toBe(`${BASE}/v1/gate/auth/session`);
      expect(c.headers['X-Session-Token']).toBe('ory_st_abc');
      expect(c.headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    });

    it('check() exposes required_aal and current_aal of a 403 mfa_required in details', async () => {
      mockFetch(403, {
        error: {
          code: 'mfa_required',
          message: 'This tenant requires a second factor.',
          request_id: 'req_1',
          required_aal: 'aal2',
          current_aal: 'aal1',
        },
      });
      const err = await gate.sessions.check('ory_st_abc').catch((e) => e);
      expect(err.code).toBe('mfa_required');
      expect(err.details).toEqual({ required_aal: 'aal2', current_aal: 'aal1' });
    });
  });

  describe('custom metadata', () => {
    it('getMetadata() unwraps metadata_public', async () => {
      const spy = mockFetch(200, { metadata_public: { plan: 'pro' } });
      expect(await gate.identities.getMetadata(USER)).toEqual({ plan: 'pro' });
      expect(call(spy).url).toBe(`${BASE}/v1/gate/identities/${USER}/metadata`);
    });

    it('updateMetadata() PATCHes the merge object, null deleting a key', async () => {
      const spy = mockFetch(200, { metadata_public: { plan: 'pro' } });
      expect(await gate.identities.updateMetadata(USER, { plan: 'pro', seats: null })).toEqual({
        plan: 'pro',
      });
      expect(call(spy).method).toBe('PATCH');
      expect(call(spy).body).toEqual({ plan: 'pro', seats: null });
    });
  });

  describe('auditLog.list()', () => {
    it('passes the filters it is given, Dates as RFC 3339, and nothing else', async () => {
      const spy = mockFetch(200, { data: [], has_more: false, next_cursor: null });
      await gate.auditLog.list({
        action: 'identity.login',
        actor_id: USER,
        from: new Date('2026-10-13T09:30:00Z'),
        limit: 2,
      });
      const url = new URL(call(spy).url);
      expect(url.pathname).toBe('/v1/gate/audit-log');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        action: 'identity.login',
        actor_id: USER,
        from: '2026-10-13T09:30:00.000Z',
        limit: '2',
      });
    });

    it('with no params asks for the first page', async () => {
      const spy = mockFetch(200, { data: [], has_more: false, next_cursor: null });
      await gate.auditLog.list();
      expect(call(spy).url).toBe(`${BASE}/v1/gate/audit-log`);
    });
  });

  describe('lifecycle', () => {
    it('listRules() reads tier and rules', async () => {
      const body = { tier: 'free', rules: [] };
      const spy = mockFetch(200, body);
      expect(await gate.lifecycle.listRules()).toEqual(body);
      expect(call(spy).url).toBe(`${BASE}/v1/gate/lifecycle/rules`);
    });

    it('setRule() sends exactly { enabled, params? }', async () => {
      const spy = mockFetch(200, { kind: 'delete_unverified' });
      await gate.lifecycle.setRule('delete_unverified', {
        enabled: true,
        params: { delete_after_days: 14, warn_before_days: 3 },
      });
      expect(call(spy).method).toBe('PUT');
      expect(call(spy).url).toBe(`${BASE}/v1/gate/lifecycle/rules/delete_unverified`);
      expect(call(spy).body).toEqual({
        enabled: true,
        params: { delete_after_days: 14, warn_before_days: 3 },
      });

      mockFetch(200, { kind: 'delete_unverified' });
      await gate.lifecycle.setRule('delete_unverified', { enabled: false });
      expect(call(spy, 1).body).toEqual({ enabled: false });
    });

    it('previewRule() wraps params, deleteRule() sends DELETE', async () => {
      const spy = mockFetch(200, { kind: 'expire_roles', available: false, matching_now: 0, capped: false });
      await gate.lifecycle.previewRule('expire_roles', {});
      expect(call(spy).url).toBe(`${BASE}/v1/gate/lifecycle/rules/expire_roles/preview`);
      expect(call(spy).body).toEqual({ params: {} });

      mockFetch(204, null);
      await gate.lifecycle.deleteRule('delete_inactive');
      expect(call(spy, 1).method).toBe('DELETE');
    });

    it('listActions() passes its filters', async () => {
      const spy = mockFetch(200, { data: [], has_more: false, next_cursor: null });
      await gate.lifecycle.listActions({ status: 'pending', identity_id: USER });
      expect(call(spy).url).toBe(
        `${BASE}/v1/gate/lifecycle/actions?status=pending&identity_id=${USER}`,
      );
    });

    it('a rule the plan does not include is a 403 plan_required', async () => {
      mockFetch(403, {
        error: { code: 'plan_required', message: 'The Free plan does not include this rule.', request_id: 'r' },
      });
      await expect(
        gate.lifecycle.setRule('remind_unverified', { enabled: true, params: { remind_after_hours: 24 } }),
      ).rejects.toMatchObject({ status: 403, code: 'plan_required' });
    });
  });

  describe('flows and social login', () => {
    it('createLoginFlow() with no params is the 1.3.0 call', async () => {
      const spy = mockFetch(200, { id: 'flow' });
      await gate.createLoginFlow();
      expect(call(spy).url).toBe(`${BASE}/v1/gate/auth/login`);
      expect(call(spy).headers['X-Session-Token']).toBeUndefined();
    });

    it('createLoginFlow() sends return_to, state and aal, and the session token as a header', async () => {
      const spy = mockFetch(200, { id: 'flow' });
      await gate.createLoginFlow({
        return_to: 'https://app.example.com/auth/callback',
        state: 'abc-123',
        aal: 'aal2',
        session_token: 'ory_st_abc',
      });
      const url = new URL(call(spy).url);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        return_to: 'https://app.example.com/auth/callback',
        state: 'abc-123',
        aal: 'aal2',
      });
      expect(call(spy).headers['X-Session-Token']).toBe('ory_st_abc');
    });

    it('createRegistrationFlow() and exchangeOidcCode()', async () => {
      const spy = mockFetch(200, { id: 'flow' });
      await gate.createRegistrationFlow({ state: 's' });
      expect(call(spy).url).toBe(`${BASE}/v1/gate/auth/registration?state=s`);

      mockFetch(200, { session_token: 'ory_st_x', session: { id: 's' } });
      const res = await gate.exchangeOidcCode('gxc_9d3e');
      expect(res.session_token).toBe('ory_st_x');
      expect(call(spy, 1).url).toBe(`${BASE}/v1/gate/auth/oidc/exchange`);
      expect(call(spy, 1).body).toEqual({ code: 'gxc_9d3e' });
    });

    it('settings.getReturnUrls() / updateReturnUrls() unwrap return_urls', async () => {
      const spy = mockFetch(200, { return_urls: [] });
      expect(await gate.settings.getReturnUrls()).toEqual([]);
      expect(call(spy).url).toBe(`${BASE}/v1/gate/settings/return-urls`);

      mockFetch(200, { return_urls: ['https://app.example.com/cb'] });
      expect(await gate.settings.updateReturnUrls(['https://APP.example.com/cb'])).toEqual([
        'https://app.example.com/cb',
      ]);
      expect(call(spy, 1).method).toBe('PUT');
      expect(call(spy, 1).body).toEqual({ return_urls: ['https://APP.example.com/cb'] });
    });
  });

  describe('tokens', () => {
    it('introspect() returns orgs for an end user and nothing but active for a dead token', async () => {
      const live = {
        active: true,
        subject: USER,
        tenant_id: 't',
        scopes: [],
        expires_at: '2026-10-14T18:00:00Z',
        orgs: [{ id: 'o', role: 'admin', permissions: ['a:b'] }],
      };
      mockFetch(200, live);
      expect(await gate.tokens.introspect('gat_live_x')).toEqual(live);
      mockFetch(200, { active: false });
      expect(await gate.tokens.introspect('gat_live_y')).toEqual({ active: false });
    });

    it('createSigned() calls whoami with the session token and no API key', async () => {
      const spy = mockFetch(200, { id: 'sess', active: true, tokenized: 'eyJ.a.b' });
      const res = await gate.tokens.createSigned('ory_st_abc');
      expect(res).toEqual({ token: 'eyJ.a.b', session: { id: 'sess', active: true } });
      const c = call(spy);
      expect(c.url).toBe(`${BASE}/auth/sessions/whoami?tokenize_as=gate_jwt`);
      expect(c.method).toBe('GET');
      expect(c.headers['X-Session-Token']).toBe('ory_st_abc');
      expect(c.headers['Authorization']).toBeUndefined();
    });
  });
});

describe('Passepartout.introspect() orgs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps orgs and orgs_truncated', async () => {
    const body = {
      active: true,
      subject: USER,
      orgs: [{ id: 'o', role: 'member', permissions: ['chat:read'] }],
      orgs_truncated: true,
    };
    mockFetch(200, body);
    const pp = new Passepartout({ apiKey: API_KEY });
    expect(await pp.introspect('ppt_live_x')).toEqual(body);
  });
});

describe('Clockwork.usage()', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads GET /v1/clockwork/usage', async () => {
    const body = { plan: 'free', tier: 'free', cron: { active: 0, limit: 10 }, delayed: { pending: 0, limit: 100 } };
    const spy = mockFetch(200, body);
    const cw = new Clockwork({ apiKey: API_KEY });
    expect(await cw.usage()).toEqual(body);
    expect(call(spy).url).toBe(`${BASE}/v1/clockwork/usage`);
  });

  it('a Clockwork error is the standard envelope', async () => {
    mockFetch(400, {
      error: { code: 'invalid_payload', message: 'Invalid cron schedule.', request_id: 'req_cw' },
    });
    const cw = new Clockwork({ apiKey: API_KEY });
    const err = await cw.jobs
      .create({ name: 'x', schedule: 'nope', url: 'https://example.com' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect(err.code).toBe('invalid_payload');
    expect(err.message).toBe('Invalid cron schedule.');
    expect(err.requestId).toBe('req_cw');
  });

  it('the older string form still keeps its sentence (fallback)', async () => {
    mockFetch(400, { error: 'Invalid cron schedule. Expected a 5-field POSIX cron expression' });
    const cw = new Clockwork({ apiKey: API_KEY });
    const err = await cw.jobs
      .create({ name: 'x', schedule: 'nope', url: 'https://example.com' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(VerneAPIError);
    expect(err.code).toBe('unknown');
    expect(err.message).toBe('Invalid cron schedule. Expected a 5-field POSIX cron expression');
  });
});
