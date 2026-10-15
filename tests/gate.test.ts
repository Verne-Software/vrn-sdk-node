import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gate, VerneAPIError, type CreateIdentityParams, type LoginFlow } from '../src/index.js';

const API_KEY = 'vrn_9f8a7c1b2d3e4f50';

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
      const identity = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com' } };
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

  describe('identities.create() for an import', () => {
    it('sends the password hash, social accounts, email_verified and metadata_public', async () => {
      const identity = {
        id: 'identity_2',
        schema_id: 'user',
        state: 'active',
        traits: { email: 'ada@example.com' },
        metadata_public: { previous_user_id: 'auth0|64f1c0ffee' },
        verifiable_addresses: [{ value: 'ada@example.com', verified: true, via: 'email', status: 'completed' }],
      };
      const spy = mockFetch(201, identity);

      const params: CreateIdentityParams = {
        schema_id: 'user',
        traits: { email: 'ada@example.com' },
        credentials: {
          password: { config: { hashed_password: '$2b$10$pl0VVKxZkNvtC9ttGwsT8.vPL8qWeEevw4a6FraeqQR8GQ6mT63NG' } },
          oidc: { config: { providers: [{ provider: 'google', subject: '109876543210987654321' }] } },
        },
        email_verified: true,
        metadata_public: { previous_user_id: 'auth0|64f1c0ffee' },
      };
      const result = await gate.identities.create(params);

      expect(result.verifiable_addresses?.[0].verified).toBe(true);
      expect(result.metadata_public).toEqual({ previous_user_id: 'auth0|64f1c0ffee' });
      expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual(params);
    });
  });

  describe('identities.get()', () => {
    it('sends GET /v1/gate/identities/:id', async () => {
      const identity = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com' } };
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
      const updated = { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com', locale: 'en' } };
      const spy = mockFetch(200, updated);

      const ops = [{ op: 'replace' as const, path: '/traits/locale', value: 'en' }];
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

  describe('identities.setState()', () => {
    it('sends PATCH /v1/gate/identities/:id/state with the state body', async () => {
      const identity = { id: 'identity_1', schema_id: 'user', state: 'inactive', traits: { email: 'a@b.com' } };
      const spy = mockFetch(200, identity);

      const result = await gate.identities.setState('identity_1', 'inactive');

      expect(result).toEqual(identity);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/identities/identity_1/state');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(init?.body as string)).toEqual({ state: 'inactive' });
    });

    it('activate() sends state=active', async () => {
      const spy = mockFetch(200, { id: 'identity_1', schema_id: 'user', state: 'active', traits: { email: 'a@b.com' } });

      await gate.identities.activate('identity_1');

      expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ state: 'active' });
    });

    it('deactivate() sends state=inactive', async () => {
      const spy = mockFetch(200, { id: 'identity_1', schema_id: 'user', state: 'inactive', traits: { email: 'a@b.com' } });

      await gate.identities.deactivate('identity_1');

      expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ state: 'inactive' });
    });
  });

  describe('identities.resendVerification()', () => {
    it('sends POST /v1/gate/identities/:id/resend-verification', async () => {
      const spy = mockFetch(204, null);

      await gate.identities.resendVerification('identity_1');

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/identities/identity_1/resend-verification');
      expect(init?.method).toBe('POST');
    });
  });

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------

  describe('tokens.create()', () => {
    it('sends the key in the Authorization header, never in the body', async () => {
      // The gateway authenticates /v1/gate/tokens from the header only; 1.3.0 sent the
      // key in the body without the header and got 401 for it.
      const tokenResponse = { access_token: 'gat_live_abc', expires_at: '2026-01-01T01:00:00Z', subject: 'usr_1', tenant_id: 'ten_1' };
      const spy = mockFetch(201, tokenResponse);

      const result = await gate.tokens.create({ subject: 'usr_1' });

      expect(result).toEqual(tokenResponse);

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/tokens');
      const body = JSON.parse(init?.body as string);
      expect(body).toEqual({ subject: 'usr_1' });
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
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
      const decision = {
        allowed: true,
        decision_id: 'dec_1',
        reason: 'owned_by_tenant',
        message: 'subject `usr_1` is an identity owned by tenant `ten_1`',
      };
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
      mockFetch(200, { allowed: false, decision_id: 'dec_2', reason: 'not_a_known_identity', message: 'no identity `usr_2`' });

      const result = await gate.authorize({ subject: 'usr_2', action: 'relay.messages.write', resource: 'tenant:ten_1' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_a_known_identity');
      expect(result.message).toBe('no identity `usr_2`');
    });
  });

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  describe('settings.getSecurity()', () => {
    it('sends GET /v1/gate/settings/security', async () => {
      const settings = { passwordless_enabled: true, mfa_enabled: false };
      const spy = mockFetch(200, settings);

      const result = await gate.settings.getSecurity();

      expect(result).toEqual(settings);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/settings/security');
      expect(init?.method).toBe('GET');
    });
  });

  describe('settings.updateSecurity()', () => {
    it('sends PUT /v1/gate/settings/security with both fields', async () => {
      const spy = mockFetch(200, { status: 'ok' });

      await gate.settings.updateSecurity({ passwordless_enabled: true, mfa_enabled: true });

      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/settings/security');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(init?.body as string)).toEqual({ passwordless_enabled: true, mfa_enabled: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Social auth (OIDC providers)
  // ---------------------------------------------------------------------------

  describe('settings.getOidcProviders()', () => {
    it('sends GET /v1/gate/settings/oidc-providers and unwraps providers', async () => {
      const providers = [
        { provider: 'github', enabled: true },
        { provider: 'google', enabled: false },
      ];
      const spy = mockFetch(200, { providers });

      const result = await gate.settings.getOidcProviders();

      expect(result).toEqual(providers);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/settings/oidc-providers');
      expect(init?.method).toBe('GET');
    });
  });

  describe('settings.updateOidcProviders()', () => {
    it('sends PUT /v1/gate/settings/oidc-providers wrapped in { providers }', async () => {
      const providers = [{ provider: 'github', enabled: true }];
      const spy = mockFetch(200, { providers });

      const result = await gate.settings.updateOidcProviders(providers);

      expect(result).toEqual(providers);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/settings/oidc-providers');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(init?.body as string)).toEqual({ providers });
    });
  });

  describe('gate.getEnabledProviders()', () => {
    it('sends GET /public/gate/providers/:id without an Authorization header', async () => {
      const spy = mockFetch(200, { providers: ['github', 'google'] });

      const result = await gate.getEnabledProviders('ten_001');

      expect(result).toEqual(['github', 'google']);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/public/gate/providers/ten_001');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined();
    });
  });

  describe('gate.createLoginFlow()', () => {
    it('sends GET /v1/gate/auth/login and returns the raw flow', async () => {
      const flow = { id: 'flow_1', ui: { action: 'https://api.vernesoft.com/auth/x', nodes: [] } };
      const spy = mockFetch(200, flow);

      const result = await gate.createLoginFlow();

      expect(result).toEqual(flow);
      // Typed: no cast needed to reach the form.
      const action: string = result.ui.action;
      expect(action).toBe('https://api.vernesoft.com/auth/x');
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe('https://api.vernesoft.com/v1/gate/auth/login');
      expect(init?.method).toBe('GET');
    });
  });

  describe('flow types', () => {
    it('ui.action, ui.nodes and node attributes are reachable without a cast', async () => {
      const raw = {
        id: 'flow_2',
        type: 'api',
        expires_at: '2026-10-15T12:00:00Z',
        issued_at: '2026-10-15T11:00:00Z',
        request_url: 'https://api.vernesoft.com/self-service/login/api',
        state: 'choose_method',
        organization_id: null,
        ui: {
          action: 'https://api.vernesoft.com/auth/self-service/login?flow=flow_2',
          method: 'POST',
          nodes: [
            {
              type: 'input',
              group: 'password',
              attributes: { name: 'identifier', type: 'text', value: '', required: true, node_type: 'input' },
              messages: [],
              meta: { label: { id: 1070004, text: 'ID', type: 'info' } },
            },
          ],
        },
      };
      mockFetch(200, raw);

      const flow: LoginFlow = await gate.createLoginFlow();
      const names = flow.ui.nodes.filter((n) => n.group === 'password').map((n) => n.attributes.name);

      expect(flow.ui.method).toBe('POST');
      expect(names).toEqual(['identifier']);
      expect(flow.ui.nodes[0].meta.label?.text).toBe('ID');
      expect(flow.organization_id).toBeNull();
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
